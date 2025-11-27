/*
* Copyright (C) 2025  Henrique Almeida
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

use crate::board::Board;
use crate::logical_solver::{self, TechniqueLevel};
use crate::solver;
use rand::rng;
use rand::seq::SliceRandom;

/// Represents the target difficulty of the generated puzzle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
    Extreme,
}

/// Generate a complete, solved Sudoku board.
fn generate_full_solution() -> Board {
    let mut board = Board { cells: [0; 81] };
    let mut numbers: [u8; 9] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    numbers.shuffle(&mut rng());
    solver::solve_randomized(&mut board, &numbers);
    board
}

/// Creates a "minimal" puzzle from a solution by removing as many clues as possible while maintaining a unique solution.
///
/// This iterates through the board in a random order and attempts to remove each number.
/// If removing a number creates multiple solutions, it puts it back.
fn create_minimal_puzzle(solution: &Board) -> Board {
    let mut puzzle = *solution;
    let mut indices: Vec<usize> = (0..81).collect();
    indices.shuffle(&mut rng());

    for index in indices {
        let original_value = puzzle.cells[index];
        puzzle.cells[index] = 0;
        if solver::count_solutions(&puzzle) != 1 {
            puzzle.cells[index] = original_value;
        }
    }
    puzzle
}

/// Check if a puzzle matches the criteria for a specific difficulty.
fn matches_difficulty(puzzle: &Board, difficulty: Difficulty) -> bool {
    let (level, solved_board) = logical_solver::get_difficulty(puzzle);
    let is_logically_solvable = solved_board.cells.iter().all(|&c| c != 0);

    match difficulty {
        Difficulty::Easy => {
            // Must be solvable with Basic techniques only.
            is_logically_solvable && level == TechniqueLevel::Basic
        }
        Difficulty::Medium => {
            // Must be solvable with Intermediate techniques, but requires more than Basic.
            is_logically_solvable && level == TechniqueLevel::Intermediate
        }
        Difficulty::Hard => {
            // Must be solvable with Advanced techniques, and MUST require at least one Advanced step.
            is_logically_solvable && level == TechniqueLevel::Advanced
        }
        Difficulty::Extreme => {
            // Must NOT be solvable by pure logic (requires backtracking / guessing).
            !is_logically_solvable
        }
    }
}

/// Generates a puzzle of a specific difficulty.
pub fn generate(difficulty: Difficulty) -> Board {
    loop {
        let solution = generate_full_solution();
        let puzzle = create_minimal_puzzle(&solution);

        if matches_difficulty(&puzzle, difficulty) {
            return puzzle;
        }
    }
}
