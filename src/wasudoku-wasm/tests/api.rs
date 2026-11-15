/*
* Copyright (C) 2025-2026  Henrique Almeida
* This file is part of WASudoku.
*
* WASudoku is free software: you can redistribute it and/or modify
* it under the terms of the GNU Affero General Public License as published
* by the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* WASudoku is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU Affero General Public License for more details.
*
* You should have received a copy of the GNU Affero General Public License
* along with WASudoku.  If not, see <https://www.gnu.org/licenses/>.
*/

use wasudoku_wasm::api::{
    self, ApiError, Generated, Hint, SEARCH_BUDGET, Validation, conflicts, next_step,
    next_step_within, parse, solve, solve_within, validate, validate_within,
};
use wasudoku_wasm::board::Board;
use wasudoku_wasm::generate::{self, Difficulty};
use wasudoku_wasm::logical_solver;
use wasudoku_wasm::solver;
use wasudoku_wasm::types::Technique;

const PUZZLE: &str =
    "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
const SOLUTION: &str =
    "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
// Norvig's "impossible" puzzle, from norvig.com/sudoku.html.
const NORVIG: &str =
    ".....5.8....6.1.43..........1.5........1.6...3.......553.....61........4.........";
const NEARLY_EMPTY: &str =
    "8................................................................................";
const TWO_SOLUTIONS: &str =
    ".....6....59.....82....8....45........3........6..3.54...325..6..................";
// An Extreme puzzle on which the logical solver takes steps and then stalls.
const STALLS_LOGIC: &str =
    ".....3....8..5.2..754.9.....62..1..8.7.....3.3..8..92.....3.415..9.4..6....6.....";

/// The 81 cell bytes of a board written with `.` for an empty cell.
fn cells(text: &str) -> Vec<u8> {
    text.bytes()
        .map(|b| if b == b'.' { 0 } else { b - b'0' })
        .collect()
}

fn board(text: &str) -> Board {
    text.parse().unwrap()
}

/// The fewest guesses `ok` needs to stop failing, found by trying each budget in turn.
fn least_budget(ok: impl Fn(u32) -> bool) -> u32 {
    (0..SEARCH_BUDGET).find(|&b| ok(b)).unwrap()
}

#[test]
fn test_parse_checks_length_and_digits_only() {
    assert_eq!(parse(&cells(PUZZLE)).unwrap(), board(PUZZLE));
    assert_eq!(parse(&[0; 80]).unwrap_err(), ApiError::BadLength);
    assert_eq!(parse(&[0; 82]).unwrap_err(), ApiError::BadLength);
    let mut bad = cells(PUZZLE);
    bad[3] = 10;
    assert_eq!(parse(&bad).unwrap_err(), ApiError::BadDigit);
    let mut repeated = cells(PUZZLE);
    repeated[2] = 5;
    assert!(parse(&repeated).is_ok());
}

#[test]
fn test_conflicts_lists_every_repeated_given() {
    let mut text = cells(PUZZLE);
    text[2] = 5;
    // Cell 2 repeats the 5 of cell 0 in row and box.
    assert_eq!(conflicts(&parse(&text).unwrap()), vec![0, 2]);
    assert!(conflicts(&board(PUZZLE)).is_empty());
}

#[test]
fn test_solve_takes_the_logical_steps_before_the_search() {
    for text in [PUZZLE, STALLS_LOGIC, TWO_SOLUTIONS, NEARLY_EMPTY] {
        let solved = solve(&cells(text)).unwrap();
        let (steps, after_logic) = logical_solver::solve_with_steps(&board(text));
        assert_eq!(solved.steps, steps, "{text}");
        assert!(!solved.solution.cells.contains(&0), "{text}");
        let kept = after_logic.cells.iter().zip(solved.solution.cells);
        assert!(kept.into_iter().all(|(&a, s)| a == 0 || a == s), "{text}");
    }
    assert_eq!(solve(&cells(PUZZLE)).unwrap().solution, board(SOLUTION));
}

#[test]
fn test_solve_rejects_what_it_cannot_solve() {
    assert_eq!(solve(&cells(NORVIG)).unwrap_err(), ApiError::NoSolution);
    assert_eq!(solve(&[0; 3]).unwrap_err(), ApiError::BadLength);
    let mut repeated = cells(PUZZLE);
    repeated[2] = 5;
    assert_eq!(solve(&repeated).unwrap_err(), ApiError::Conflict);
}

#[test]
fn test_solve_gives_up_at_the_budget() {
    let text = cells(TWO_SOLUTIONS);
    assert_eq!(
        solve_within(&text, 0).unwrap_err(),
        ApiError::SearchLimit,
        "the count needs a guess"
    );
    // Enough for the count but not for the ordered search that picks among the solutions.
    let counted = least_budget(|b| solver::count_within(&board(TWO_SOLUTIONS), b).is_ok());
    let (_, after) = logical_solver::solve_with_steps(&board(TWO_SOLUTIONS));
    assert!(solver::solve_within(&after, counted).is_err());
    assert_eq!(
        solve_within(&text, counted).unwrap_err(),
        ApiError::SearchLimit
    );
}

#[test]
fn test_solve_takes_the_solution_logic_reaches() {
    // The ordered search would take more guesses than the count, so logic must finish this one.
    let solved = solve(&cells(PUZZLE)).unwrap();
    let (_, after) = logical_solver::solve_with_steps(&board(PUZZLE));
    assert!(!after.cells.contains(&0));
    assert_eq!(solved.solution, after);
}

#[test]
fn test_validate_tells_each_outcome_apart() {
    assert_eq!(
        validate(&cells(PUZZLE)).unwrap(),
        Validation::Unique(board(SOLUTION))
    );
    assert_eq!(validate(&cells(NORVIG)).unwrap(), Validation::Unsolvable);
    assert_eq!(validate(&cells(NEARLY_EMPTY)).unwrap(), Validation::Several);
    let mut repeated = cells(NEARLY_EMPTY);
    repeated[1] = 8;
    repeated[80] = 8;
    assert_eq!(
        validate(&repeated).unwrap(),
        Validation::Conflict(vec![0, 1])
    );
    assert_eq!(validate(&[0; 81 + 1]).unwrap_err(), ApiError::BadLength);
    assert_eq!(
        validate_within(&cells(NEARLY_EMPTY), 0).unwrap_err(),
        ApiError::SearchLimit
    );
}

#[test]
fn test_generate_is_seeded() {
    for difficulty in Difficulty::ALL {
        let generated = api::generate(difficulty, 7);
        let (puzzle, solution) = generate::generate_with_seed(difficulty, 7);
        assert_eq!(
            generated,
            Generated {
                puzzle,
                solution,
                difficulty
            }
        );
        assert_eq!(api::generate(difficulty, 7), generated);
    }
}

#[test]
fn test_difficulty_codes_round_trip() {
    for difficulty in Difficulty::ALL {
        assert_eq!(api::difficulty(difficulty as u8).unwrap(), difficulty);
    }
    let past_last = Difficulty::ALL.len() as u8;
    assert_eq!(
        api::difficulty(past_last).unwrap_err(),
        ApiError::BadDifficulty
    );
}

#[test]
fn test_next_step_is_the_first_step_of_a_solve() {
    for text in [PUZZLE, STALLS_LOGIC, TWO_SOLUTIONS] {
        let first = solve(&cells(text))
            .unwrap()
            .steps
            .into_iter()
            .next()
            .unwrap();
        match next_step(&cells(text)).unwrap() {
            Hint::Step(step) => assert_eq!(step, first, "{text}"),
            Hint::Stuck(_) => panic!("{text} has a logical step"),
        }
    }
}

#[test]
fn test_next_step_reveals_the_solution_when_logic_is_stuck() {
    let stuck = |text: &str| match next_step(&cells(text)).unwrap() {
        Hint::Stuck(solution) => solution,
        Hint::Step(step) => panic!("{text} has a {:?} step", step.technique),
    };
    assert_eq!(
        stuck(NEARLY_EMPTY),
        solve(&cells(NEARLY_EMPTY)).unwrap().solution
    );
    assert_eq!(stuck(SOLUTION), board(SOLUTION));
}

#[test]
fn test_next_step_rejects_what_solve_rejects() {
    assert_eq!(next_step(&cells(NORVIG)).unwrap_err(), ApiError::NoSolution);
    assert_eq!(next_step(&[]).unwrap_err(), ApiError::BadLength);
    let mut repeated = cells(PUZZLE);
    repeated[2] = 5;
    assert_eq!(next_step(&repeated).unwrap_err(), ApiError::Conflict);
    assert_eq!(
        next_step_within(&cells(NEARLY_EMPTY), 0).unwrap_err(),
        ApiError::SearchLimit
    );
}

#[test]
fn test_the_steps_name_their_technique() {
    let solved = solve(&cells(PUZZLE)).unwrap();
    assert_eq!(solved.steps[0].technique, Technique::NakedSingle);
}
