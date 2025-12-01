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
use crate::logical_solver;
use crate::solver;
use rand::rng;
use rand::seq::SliceRandom;

/// Represents the target difficulty of the generated puzzle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
    Expert,
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

/// Creates a "minimal" puzzle from a solution by removing as many clues as possible.
///
/// * `min_clues`: If specified, the minimization stops when the clue count drops below this number.
///   This is used to generate easier puzzles with more cues.
fn create_minimal_puzzle_symmetric(solution: &Board, min_clues: Option<usize>) -> Board {
    let mut puzzle = *solution;
    let mut current_clues = 81;

    // Create a list of indices to try removing.
    // We only need 0..41 because we process pairs (i, 80-i).
    // 40 is the center cell (80/2), processed alone.
    let mut indices: Vec<usize> = (0..41).collect();
    indices.shuffle(&mut rng());

    for &index in &indices {
        // If we have a lower bound on clues and we hit it, stop removing.
        if min_clues.is_some_and(|min| current_clues <= min) {
            break;
        }

        let sym_index = 80 - index;

        let val1 = puzzle.cells[index];
        let val2 = puzzle.cells[sym_index];

        // Temporarily remove
        puzzle.cells[index] = 0;
        puzzle.cells[sym_index] = 0;

        // Check uniqueness
        if solver::count_solutions(&puzzle) != 1 {
            // If not unique, restore
            puzzle.cells[index] = val1;
            puzzle.cells[sym_index] = val2;
        } else {
            // Successful removal
            current_clues -= if index == sym_index { 1 } else { 2 };
        }
    }
    puzzle
}

/// Check if a puzzle matches the criteria for a specific difficulty.
fn matches_difficulty(puzzle: &Board, difficulty: Difficulty) -> bool {
    let (steps, solved_board) = logical_solver::solve_with_steps(puzzle);
    let is_logically_solvable = solved_board.cells.iter().all(|&c| c != 0);

    let stats = logical_solver::analyze_difficulty(&steps);

    match difficulty {
        Difficulty::Easy => {
            // Must be solvable and only require Basic techniques
            is_logically_solvable && stats.max_level == logical_solver::TechniqueLevel::Basic
        }
        Difficulty::Medium => {
            // Must be solvable, meet minimum counts for steps, and not exceed Intermediate level
            is_logically_solvable
                && stats.max_level == logical_solver::TechniqueLevel::Intermediate
                && stats.intermediate_count >= 5
        }
        Difficulty::Hard => {
            // Must be solvable, meet minimum counts for steps, and not exceed Advanced level
            is_logically_solvable
                && stats.max_level == logical_solver::TechniqueLevel::Advanced
                && stats.advanced_count >= 3
                && stats.intermediate_count >= 5
        }
        Difficulty::Expert => {
            // Must be solvable, and require Master techniques
            is_logically_solvable
                && stats.master_count >= 2
                && stats.advanced_count >= 3
                && stats.intermediate_count >= 5
        }
        Difficulty::Extreme => {
            // Must NOT be solvable by pure logic (requires backtracking / guessing).
            !is_logically_solvable
        }
    }
}

/// Generates a puzzle of a specific difficulty.
pub fn generate(difficulty: Difficulty) -> Board {
    // For Easy puzzles, we stop minimizing around 32-36 clues to keep it approachable.
    // Standard min is 17, typical easy is 36+.
    let min_clues = if difficulty == Difficulty::Easy {
        Some(32)
    } else {
        None
    };

    loop {
        let solution = generate_full_solution();

        // Using symmetric minimization is the key performance optimization here.
        let puzzle = create_minimal_puzzle_symmetric(&solution, min_clues);

        if matches_difficulty(&puzzle, difficulty) {
            return puzzle;
        }
    }
}
