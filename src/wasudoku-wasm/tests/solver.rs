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

use rand::rngs::StdRng;
use rand::seq::SliceRandom;
use rand::{RngExt, SeedableRng};
use std::time::{Duration, Instant};
use wasudoku_wasm::board::Board;
use wasudoku_wasm::generate::{self, Difficulty};
use wasudoku_wasm::logical_solver;
use wasudoku_wasm::solver::{count_solutions, solve, solve_randomized, unique_solution};
use wasudoku_wasm::{solve_board, validate_puzzle};

#[test]
fn test_solve_easy_puzzle() {
    let puzzle_str =
        "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
    let solution_str =
        "534678912672195348198342567859761423426853791713924856961537284287419635345286179";

    let mut board: Board = puzzle_str.parse().unwrap();
    let solved = solve(&mut board);

    assert!(solved);
    assert_eq!(board.to_string(), solution_str);
}

#[test]
fn test_solve_hard_puzzle() {
    let puzzle_str =
        "8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..";
    let solution_str =
        "812753649943682175675491283154237896369845721287169534521974368438526917796318452";

    let mut board: Board = puzzle_str.parse().unwrap();
    let solved = solve(&mut board);

    assert!(solved);
    assert_eq!(board.to_string(), solution_str);
}

#[test]
fn test_already_solved_puzzle() {
    let solution_str =
        "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
    let mut board: Board = solution_str.parse().unwrap();
    let solved = solve(&mut board);

    assert!(solved);
    assert_eq!(board.to_string(), solution_str);
}

#[test]
fn test_unsolvable_puzzle_returns_false() {
    // An unsolvable puzzle `23456789` in a row and a `1` in the box where it should be.
    let puzzle_str =
        "...................................123456789.....................................";
    let mut board: Board = puzzle_str.parse().unwrap();

    // The solver should correctly determine this is unsolvable and return false.
    let solved = solve(&mut board);
    assert!(!solved);
}

#[test]
fn test_solve_randomized_unsolvable_immediate() {
    // Construct a board where a specific cell is empty but has no valid moves.
    let mut board = Board { cells: [0; 81] };
    for i in 1..9 {
        board.cells[i] = i as u8;
    }
    board.cells[9] = 9;

    let numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    let result = solve_randomized(&mut board, &numbers);
    assert!(!result);
}

#[test]
fn test_solve_randomized_backtracking() {
    // Manually construct a specific board state that forces backtracking.
    let mut board = Board { cells: [0; 81] };

    // Fill Row 0 indices 3..8 with 3..8
    for i in 3..9 {
        board.cells[i] = i as u8;
    }

    // Block 9 from (0,0), (0,1), (0,2) using column blockers
    board.cells[9] = 9; // Blocks 9 for (0,0)
    board.cells[19] = 9; // Blocks 9 for (0,1)
    board.cells[29] = 9; // Blocks 9 for (0,2)

    let numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    let result = solve_randomized(&mut board, &numbers);

    assert!(!result, "Pigeonhole board should be unsolvable");
}

#[test]
fn test_board_from_str_valid() {
    let puzzle_str =
        "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
    assert!(puzzle_str.parse::<Board>().is_ok());
}

#[test]
fn test_board_from_str_invalid_length() {
    let puzzle_str = "123";
    assert!(puzzle_str.parse::<Board>().is_err());
}

#[test]
fn test_board_from_str_invalid_char() {
    let puzzle_str =
        "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..7a";
    assert!(puzzle_str.parse::<Board>().is_err());
}

#[test]
fn test_board_from_str_conflict_in_row() {
    // Two 5s in the first row.
    let puzzle_str =
        "53..7.5..6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
    assert!(puzzle_str.parse::<Board>().is_err());
}

#[test]
fn test_board_from_str_conflict_in_col() {
    // Two 5s in the first column.
    let puzzle_str =
        "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
    let mut chars: Vec<char> = puzzle_str.chars().collect();
    chars[9] = '5'; // Second row, first column -> conflict with first row, first column
    let conflict_str: String = chars.into_iter().collect();
    assert!(conflict_str.parse::<Board>().is_err());
}

#[test]
fn test_board_from_str_conflict_in_box() {
    // Two 1s in the first 3x3 box.
    let puzzle_str =
        "53..7....61.195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
    assert!(puzzle_str.parse::<Board>().is_err());
}

#[test]
fn test_solve_randomized_solves_empty_board() {
    let mut board = Board { cells: [0; 81] };
    let numbers: [u8; 9] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    let solved = solve_randomized(&mut board, &numbers);
    assert!(solved);
    assert!(!board.cells.contains(&0));
}

#[test]
fn test_count_solutions() {
    // Puzzle with a unique solution
    let puzzle_str =
        "8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..";
    let board: Board = puzzle_str.parse().unwrap();
    assert_eq!(count_solutions(&board), 1);

    // Puzzle with multiple solutions
    let multi_solution_str =
        ".................................................................................";
    let board: Board = multi_solution_str.parse().unwrap();
    assert!(
        count_solutions(&board) > 1,
        "Expected more than one solution for an empty board"
    );

    // Puzzle with no solution
    let no_solution_str =
        "...................................123456789.....................................";
    let board: Board = no_solution_str.parse().unwrap();
    assert_eq!(count_solutions(&board), 0);
}

fn is_complete_solution_of(solution: &Board, puzzle: &Board) -> bool {
    let full = (0..81).all(|i| {
        let digit = solution.cells[i];
        let (row, col) = (i / 9, i % 9);
        let mut without = *solution;
        without.cells[i] = 0;
        digit != 0 && without.is_valid_move(row, col, digit)
    });
    let keeps_clues = (0..81).all(|i| puzzle.cells[i] == 0 || puzzle.cells[i] == solution.cells[i]);
    full && keeps_clues
}

const UNIQUE: &str =
    "8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..";
const UNIQUE_SOLUTION: &str =
    "812753649943682175675491283154237896369845721287169534521974368438526917796318452";
const TWO_SOLUTIONS: &str =
    ".....6....59.....82....8....45........3........6..3.54...325..6..................";
const NO_SOLUTION: &str =
    "...................................123456789.....................................";

#[test]
fn test_unique_solution_by_count() {
    let unique = unique_solution(&UNIQUE.parse().unwrap());
    assert_eq!(unique.unwrap().to_string(), UNIQUE_SOLUTION);
    let empty = Board { cells: [0; 81] };
    for puzzle in [
        TWO_SOLUTIONS.parse().unwrap(),
        empty,
        NO_SOLUTION.parse().unwrap(),
    ] {
        assert!(unique_solution(&puzzle).is_none(), "{puzzle}");
    }
}

#[test]
fn test_validate_puzzle_by_count() {
    assert_eq!(
        validate_puzzle(UNIQUE).unwrap().as_deref(),
        Some(UNIQUE_SOLUTION)
    );
    assert_eq!(validate_puzzle(TWO_SOLUTIONS).unwrap(), None);
    assert_eq!(validate_puzzle(&".".repeat(81)).unwrap(), None);
    assert_eq!(validate_puzzle(NO_SOLUTION).unwrap(), None);
}

// Each took 0.1 to 6 s to reject before the counting search branched on units, and takes about 1 ms since.
// The budget leaves room for a loaded machine and coverage instrumentation.
const UNSOLVABLE_BUDGET: Duration = Duration::from_millis(250);
const SLOW_UNSOLVABLE: [&str; 6] = [
    // Norvig's "impossible" puzzle, from norvig.com/sudoku.html.
    ".....5.8....6.1.43..........1.5........1.6...3.......553.....61........4.........",
    // The slowest of 3,000 seeded random boards with 17 to 26 clues and no conflict.
    ".8.6.....6.98.5...5.........9.1.....8...9...6........99.......8..2..........8.2..",
    "...2......4...3...3.....8..........4..6.........58..1.1.....2...52..........51..7",
    "......5..........331....4.....3....99.....7......7...6495.3.........7...........7",
    "3.......44.......6.....4..5.4..9..8...5....2...8.....7.5.14.......3.......3..9...",
    "..53............6.......8..84..1....59......2....8........5....3...7..8.......73.",
];

/// Run `f` and fail if it takes longer than `UNSOLVABLE_BUDGET`.
fn within_budget<T>(puzzle: &str, f: impl FnOnce() -> T) -> T {
    let start = Instant::now();
    let result = f();
    let elapsed = start.elapsed();
    assert!(elapsed < UNSOLVABLE_BUDGET, "{puzzle} took {elapsed:?}");
    result
}

#[test]
fn test_slow_unsolvable_boards_are_rejected_in_budget() {
    for puzzle in SLOW_UNSOLVABLE {
        let board: Board = puzzle.parse().unwrap();
        assert!(within_budget(puzzle, || solve_board(&board)).is_none());
        assert_eq!(
            within_budget(puzzle, || validate_puzzle(puzzle).unwrap()),
            None
        );
        assert_eq!(within_budget(puzzle, || count_solutions(&board)), 0);
    }
}

// The first solution the app returned for each before counting came first, with logic or the ordered search.
const FIRST_SOLUTIONS: [(&str, &str); 6] = [
    (
        TWO_SOLUTIONS,
        "438796215659132478271458693845219367713564829926873154194325786362987541587641932",
    ),
    (
        ".................................................................................",
        "123456789456789123789123456231674895875912364694538217317265948542897631968341572",
    ),
    (
        ".................1.....2.3......3.2...1.4...........6..3......4.7..8...962...7...",
        "316879542852634791749152836487963125261745983593218467938521674174386259625497318",
    ),
    (
        ".................1.......3......3.2...4....5...6.1.....3......6.7..8...952.7.....",
        "153469782847235961962178435715893624394627158286514397438951276671382549529746813",
    ),
    (
        ".91....2.6..1..3.....9...7..4......7..93....8.37..8..9...6...1.8............2.4..",
        "791834526682157394354962871548296137169375248237418659423689715815743962976521483",
    ),
    (
        "..1.96............2.....89..2...1...9........1.7...........86.2.....21.7...7..4..",
        "351896274798254316246137895625371948934685721187429563479518632863942157512763489",
    ),
];

#[test]
fn test_solve_board_keeps_first_of_several_solutions() {
    for (puzzle, expected) in FIRST_SOLUTIONS {
        let board: Board = puzzle.parse().unwrap();
        assert_eq!(count_solutions(&board), 2, "{puzzle}");
        let (_, solution) = solve_board(&board).unwrap();
        assert_eq!(solution.to_string(), expected, "{puzzle}");
    }
}

// An Extreme puzzle on which the logical solver takes steps and then stalls.
const STALLS_LOGIC: &str =
    ".....3....8..5.2..754.9.....62..1..8.7.....3.3..8..92.....3.415..9.4..6....6.....";
const STALLS_LOGIC_SOLUTION: &str =
    "296183754183754296754296183962371548578429631341865927627938415819547362435612879";

#[test]
fn test_solve_board_finishes_with_the_unique_solution() {
    let board: Board = STALLS_LOGIC.parse().unwrap();
    let (_, after_logic) = logical_solver::solve_with_steps(&board);
    assert!(after_logic.cells.contains(&0), "logic alone solves it");
    let (steps, solution) = solve_board(&board).unwrap();
    assert!(!steps.is_empty());
    assert_eq!(solution.to_string(), STALLS_LOGIC_SOLUTION);
}

#[test]
fn test_conflicting_board_has_no_solution() {
    let mut board = Board { cells: [0; 81] };
    board.cells[0] = 5;
    board.cells[1] = 5;
    assert_eq!(count_solutions(&board), 0);
    assert!(unique_solution(&board).is_none());
    assert!(!solve(&mut board));
}

#[test]
fn test_out_of_range_digit_has_no_solution() {
    let mut board = Board { cells: [0; 81] };
    board.cells[0] = 10;
    assert_eq!(count_solutions(&board), 0);
    board.cells[0] = u8::MAX;
    assert_eq!(count_solutions(&board), 0);
    assert!(!solve(&mut board));
}

#[test]
fn test_failed_solve_leaves_board_unchanged() {
    let puzzle: Board =
        "...................................123456789....................................."
            .parse()
            .unwrap();
    let mut board = puzzle;
    assert!(!solve(&mut board));
    assert!(board == puzzle);
}

#[test]
fn test_solve_randomized_follows_digit_order() {
    let mut ascending = Board { cells: [0; 81] };
    let mut descending = Board { cells: [0; 81] };
    assert!(solve_randomized(
        &mut ascending,
        &[1, 2, 3, 4, 5, 6, 7, 8, 9]
    ));
    assert!(solve_randomized(
        &mut descending,
        &[9, 8, 7, 6, 5, 4, 3, 2, 1]
    ));
    assert_eq!(&ascending.cells[..9], &[1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert_eq!(&descending.cells[..9], &[9, 8, 7, 6, 5, 4, 3, 2, 1]);
    let empty = Board { cells: [0; 81] };
    assert!(is_complete_solution_of(&ascending, &empty));
    assert!(is_complete_solution_of(&descending, &empty));
}

/// The backtracking search the solver used before propagation, kept as an oracle for its results.
/// It rescans every cell for the one with the fewest candidates and propagates nothing.
struct Reference<'a> {
    cells: [u8; 81],
    order: &'a [u8; 9],
    limit: u8,
    found: u8,
    first: Option<Board>,
}

impl Reference<'_> {
    fn run(board: &Board, order: &[u8; 9], limit: u8) -> (u8, Option<Board>) {
        let mut search = Reference {
            cells: board.cells,
            order,
            limit,
            found: 0,
            first: None,
        };
        search.descend();
        (search.found, search.first)
    }

    fn candidates(&self, i: usize) -> u16 {
        let board = Board { cells: self.cells };
        (1..=9u8)
            .filter(|&d| board.is_valid_move(i / 9, i % 9, d))
            .fold(0, |mask, d| mask | 1 << (d - 1))
    }

    fn descend(&mut self) {
        let mut best: Option<(usize, u16)> = None;
        for i in (0..81).filter(|&i| self.cells[i] == 0) {
            let candidates = self.candidates(i);
            let count = candidates.count_ones();
            if count == 0 {
                return;
            }
            if best.is_none_or(|(_, mask)| count < mask.count_ones()) {
                best = Some((i, candidates));
            }
        }
        let Some((i, candidates)) = best else {
            self.found += 1;
            self.first.get_or_insert(Board { cells: self.cells });
            return;
        };
        for &digit in self.order {
            if candidates & 1 << (digit - 1) != 0 && self.found < self.limit {
                self.cells[i] = digit;
                self.descend();
            }
        }
        self.cells[i] = 0;
    }
}

/// Seeded boards from full grids down to sparse ones with many solutions, some made unsolvable.
fn sample_boards(count: usize) -> Vec<Board> {
    let mut rng = StdRng::seed_from_u64(81);
    (0..count)
        .map(|n| {
            let mut order = [1, 2, 3, 4, 5, 6, 7, 8, 9];
            order.shuffle(&mut rng);
            let mut board = Reference::run(&Board { cells: [0; 81] }, &order, 1)
                .1
                .unwrap();
            let mut cells: Vec<usize> = (0..81).collect();
            cells.shuffle(&mut rng);
            for &i in &cells[..rng.random_range(0..58)] {
                board.cells[i] = 0;
            }
            // Every fourth board trades a clue for a digit that breaks no rule, often leaving no solution.
            if n % 4 == 3 {
                let i = cells[0];
                board.cells[i] = (1..=9u8)
                    .find(|&d| board.is_valid_move(i / 9, i % 9, d) && d != board.cells[i])
                    .unwrap_or(0);
            }
            board
        })
        .collect()
}

#[test]
fn test_solver_matches_reference_search() {
    let mut rng = StdRng::seed_from_u64(9);
    let mut seen = [0; 3];
    for board in sample_boards(400) {
        let mut order = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        order.shuffle(&mut rng);
        let (count, first) = Reference::run(&board, &order, 1);
        let mut solved = board;
        assert_eq!(solve_randomized(&mut solved, &order), count == 1, "{board}");
        assert!(solved == first.unwrap_or(board), "{board}");

        let expected = Reference::run(&board, &[1, 2, 3, 4, 5, 6, 7, 8, 9], 2);
        assert_eq!(count_solutions(&board), expected.0, "{board}");
        let unique = expected.1.filter(|_| expected.0 == 1);
        assert!(unique_solution(&board) == unique, "{board}");
        seen[expected.0 as usize] += 1;
    }
    assert!(seen.iter().all(|&n| n > 20), "samples by count {seen:?}");
}

// Run with `cargo test --release --test solver -- --ignored --nocapture`, deterministic unlike generation.
#[test]
#[ignore]
fn bench_count_solutions_fixed_puzzles() {
    let puzzles = [
        "8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..",
        "4.....8.5.3..........7......2.....6.....8.4......1.......6.3.7.5..2.....1.4......",
        "..53.....8......2..7..1.5..4....53...1..7...6..32...8..6.5....9..4....3......97..",
        ".....6....59.....82....8....45........3........6..3.54...325..6..................",
        ".................................................................................",
    ];
    for puzzle in puzzles {
        let board: Board = puzzle.parse().unwrap();
        let count = std::hint::black_box(count_solutions(&board));
        let count_ms = time_per_call(|| count_solutions(std::hint::black_box(&board)));
        let solve_ms = time_per_call(|| solve(&mut std::hint::black_box(board)));
        let validate_ms = time_per_call(|| validate_puzzle(std::hint::black_box(puzzle)).unwrap());
        println!(
            "{}: count={} count_solutions {:.4}ms solve {:.4}ms validate_puzzle {:.4}ms per call",
            &puzzle[..20],
            count,
            count_ms,
            solve_ms,
            validate_ms
        );
    }
    // Seeded boards like those generation checks, from a full grid down to a sparse one.
    let boards = sample_boards(2000);
    let start = std::time::Instant::now();
    for board in &boards {
        std::hint::black_box(count_solutions(std::hint::black_box(board)));
    }
    let per_board = start.elapsed().as_secs_f64() * 1e6 / boards.len() as f64;
    println!(
        "{} sampled boards: count_solutions {per_board:.2}us per call",
        boards.len()
    );

    // Seeded Extreme puzzles, and what is left of them for `solve_sudoku` to backtrack once logic stalls.
    let puzzles: Vec<Board> = (0..20)
        .map(|seed| generate::generate_with_seed(Difficulty::Extreme, seed).0)
        .collect();
    let stalled: Vec<Board> = puzzles
        .iter()
        .map(|puzzle| logical_solver::solve_with_steps(puzzle).1)
        .collect();
    let count_ms = time_per_call(|| puzzles.iter().map(count_solutions).sum::<u8>());
    let solve_ms = time_per_call(|| stalled.iter().filter(|&&b| solve(&mut b.clone())).count());
    println!(
        "{} Extreme puzzles: count_solutions {:.2}us, solve after logic {:.2}us per call",
        puzzles.len(),
        count_ms * 1000.0 / puzzles.len() as f64,
        solve_ms * 1000.0 / stalled.len() as f64
    );
}

/// Mean time of `f` in milliseconds over at least 20 calls and 200ms.
fn time_per_call<T>(mut f: impl FnMut() -> T) -> f64 {
    let start = std::time::Instant::now();
    let mut calls = 0;
    while calls < 20 || start.elapsed().as_millis() < 200 {
        std::hint::black_box(f());
        calls += 1;
    }
    start.elapsed().as_secs_f64() * 1000.0 / calls as f64
}
