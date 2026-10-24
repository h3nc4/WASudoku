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

use crate::board::Board;
use crate::logical_solver::{self, PEER_MASKS, TechniqueLevel, mask_indices};
use crate::solver;
use rand::rngs::StdRng;
use rand::seq::SliceRandom;
use rand::{Rng, SeedableRng};
use std::str::FromStr;

/// Represents the target difficulty of the generated puzzle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
    Expert,
    Extreme,
}

/// Parse the lower-case name the frontend sends, such as `"easy"`.
///
/// ### Errors
///
/// Returns an `Err` for any other string.
impl FromStr for Difficulty {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "easy" => Ok(Self::Easy),
            "medium" => Ok(Self::Medium),
            "hard" => Ok(Self::Hard),
            "expert" => Ok(Self::Expert),
            "extreme" => Ok(Self::Extreme),
            _ => Err("Invalid difficulty level.".to_string()),
        }
    }
}

/// Generate a complete, solved Sudoku board.
fn generate_full_solution<R: Rng + ?Sized>(rng: &mut R) -> Board {
    let mut board = Board { cells: [0; 81] };
    let mut numbers: [u8; 9] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    numbers.shuffle(rng);
    solver::solve_randomized(&mut board, &numbers);
    board
}

/// Every set of cells whose two digits can swap places and leave a valid grid.
/// A puzzle with no clue in one of them has a second solution, so no search is needed.
fn two_digit_unavoidable_sets(solution: &Board) -> Vec<u128> {
    let mut digit_cells = [0u128; 10];
    for (i, &digit) in solution.cells.iter().enumerate() {
        digit_cells[digit as usize] |= 1 << i;
    }
    let mut sets = Vec::new();
    for x in 1..=9 {
        for y in x + 1..=9 {
            let pair = digit_cells[x] | digit_cells[y];
            let mut rest = pair;
            // Each connected group of peers among the cells of x and y swaps on its own
            while rest != 0 {
                let set = peer_group(rest.isolate_lowest_one(), pair);
                rest &= !set;
                sets.push(set);
            }
        }
    }
    sets
}

/// Grow `set` into every cell of `cells` it reaches through peers, one hop at a time.
fn peer_group(mut set: u128, cells: u128) -> u128 {
    loop {
        let grown = mask_indices(set).fold(set, |m, i| m | (PEER_MASKS[i] & cells));
        if grown == set {
            return set;
        }
        set = grown;
    }
}

/// Creates a "minimal" puzzle from a solution by removing as many clues as possible.
///
/// * `min_clues`: If specified, the minimization stops when the clue count drops below this number.
///   This is used to generate easier puzzles with more cues.
fn create_minimal_puzzle_symmetric<R: Rng + ?Sized>(
    solution: &Board,
    min_clues: Option<usize>,
    rng: &mut R,
) -> Board {
    let mut puzzle = *solution;
    let mut current_clues = 81;
    let unavoidable = two_digit_unavoidable_sets(solution);
    let mut clue_mask: u128 = (1 << 81) - 1;

    // Create a list of indices to try removing.
    // We only need 0..41 because we process pairs (i, 80-i).
    // 40 is the center cell (80/2), processed alone.
    let mut indices: Vec<usize> = (0..41).collect();
    indices.shuffle(rng);

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

        // Check uniqueness, skipping the search when an unavoidable set has no clue left
        let clues = clue_mask & !((1 << index) | (1 << sym_index));
        let unique = unavoidable.iter().all(|&set| set & clues != 0)
            && solver::count_solutions(&puzzle) == 1;
        if !unique {
            // If not unique, restore
            puzzle.cells[index] = val1;
            puzzle.cells[sym_index] = val2;
        } else {
            // Successful removal
            clue_mask = clues;
            current_clues -= if index == sym_index { 1 } else { 2 };
        }
    }
    puzzle
}

/// Check if a puzzle matches the criteria for a specific difficulty.
fn matches_difficulty(puzzle: &Board, difficulty: Difficulty) -> bool {
    // Any step above the level a target allows fails it, so grading can stop there
    let ceiling = match difficulty {
        Difficulty::Easy => TechniqueLevel::Basic,
        Difficulty::Medium => TechniqueLevel::Intermediate,
        Difficulty::Hard => TechniqueLevel::Advanced,
        Difficulty::Expert | Difficulty::Extreme => TechniqueLevel::Master,
    };
    let (stats, is_logically_solvable) = logical_solver::grade(puzzle, ceiling);

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

/// Generates a puzzle of a specific difficulty, returned as `(puzzle, solution)`.
pub fn generate(difficulty: Difficulty) -> (Board, Board) {
    generate_with_rng(difficulty, &mut rand::rng())
}

/// Same as [`generate`], but reproducible: one seed always yields the same pair.
pub fn generate_with_seed(difficulty: Difficulty, seed: u64) -> (Board, Board) {
    generate_with_rng(difficulty, &mut StdRng::seed_from_u64(seed))
}

/// Same as [`generate`], drawing every random choice from `rng`.
pub fn generate_with_rng<R: Rng + ?Sized>(difficulty: Difficulty, rng: &mut R) -> (Board, Board) {
    // For Easy puzzles, we stop minimizing around 32-36 clues to keep it approachable.
    // Standard min is 17, typical easy is 36+.
    let min_clues = if difficulty == Difficulty::Easy {
        Some(32)
    } else {
        None
    };

    loop {
        let solution = generate_full_solution(rng);

        // Using symmetric minimization is the key performance optimization here.
        let puzzle = create_minimal_puzzle_symmetric(&solution, min_clues, rng);

        if matches_difficulty(&puzzle, difficulty) {
            return (puzzle, solution);
        }
    }
}
