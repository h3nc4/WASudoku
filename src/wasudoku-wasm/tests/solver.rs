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

use wasudoku_wasm::board::Board;
use wasudoku_wasm::solver::{count_and_first_solution, count_solutions, solve, solve_randomized};

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

#[test]
fn test_count_and_first_solution_unique() {
    let puzzle: Board =
        "8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4.."
            .parse()
            .unwrap();
    let (count, first) = count_and_first_solution(&puzzle);
    assert_eq!(count, 1);
    assert_eq!(
        first.unwrap().to_string(),
        "812753649943682175675491283154237896369845721287169534521974368438526917796318452"
    );
}

#[test]
fn test_count_and_first_solution_multiple() {
    let puzzle: Board =
        ".....6....59.....82....8....45........3........6..3.54...325..6.................."
            .parse()
            .unwrap();
    let (count, first) = count_and_first_solution(&puzzle);
    assert_eq!(count, 2);
    assert!(is_complete_solution_of(&first.unwrap(), &puzzle));
}

#[test]
fn test_count_and_first_solution_none() {
    let puzzle: Board =
        "...................................123456789....................................."
            .parse()
            .unwrap();
    assert!(matches!(count_and_first_solution(&puzzle), (0, None)));
}

#[test]
fn test_conflicting_board_has_no_solution() {
    let mut board = Board { cells: [0; 81] };
    board.cells[0] = 5;
    board.cells[1] = 5;
    assert_eq!(count_solutions(&board), 0);
    assert!(!solve(&mut board));
}

#[test]
fn test_out_of_range_digit_has_no_solution() {
    let mut board = Board { cells: [0; 81] };
    board.cells[0] = 10;
    assert_eq!(count_solutions(&board), 0);
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
        let start = std::time::Instant::now();
        let mut count = 0;
        for _ in 0..20 {
            count = std::hint::black_box(count_solutions(&board));
        }
        let per_call = start.elapsed().as_secs_f64() * 1000.0 / 20.0;
        println!(
            "{}: count={} {:.3}ms per call",
            &puzzle[..20],
            count,
            per_call
        );
    }
}
