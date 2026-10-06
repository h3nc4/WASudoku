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

pub mod board;
pub mod generate;
pub mod logical_solver;
pub mod solver;
pub mod types;
mod utils;

use board::Board;
use generate::Difficulty;
use serde::{Deserialize, Serialize};
use types::SolveResult;
use wasm_bindgen::prelude::*;

/// A generated puzzle together with the solution it was carved from.
#[derive(Serialize, Deserialize)]
pub struct GeneratedPuzzle {
    /// The 81-character puzzle, with `.` for empty cells.
    pub puzzle: String,
    /// The 81-character solved board.
    pub solution: String,
}

/// Set the panic hook to forward Rust panics to the browser console.
#[wasm_bindgen(start)]
pub fn main() {
    utils::set_panic_hook();
}

fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Solve a Sudoku puzzle and return the logical steps and solution.
///
/// This function employs a hybrid strategy. It first applies logical solving
/// techniques to generate human-readable steps. If logic alone cannot solve
/// the puzzle, it falls back to a high-speed backtracking algorithm to find
/// the final solution.
///
/// ### Arguments
///
/// * `board_str` - An 81-character string representing the Sudoku board,
///   with `.` or `0` for empty cells.
///
/// ### Returns
///
/// * A `JsValue` containing the serialized `SolveResult`, which includes
///   the logical steps and an optional final solution string.
///
/// ### Errors
///
/// * A `JsValue` error if the input is invalid or the puzzle is unsolvable.
#[wasm_bindgen]
pub fn solve_sudoku(board_str: &str) -> Result<JsValue, JsValue> {
    let initial_board: Board = board_str
        .parse::<Board>()
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    let (steps, mut board_after_logic) = logical_solver::solve_with_steps(&initial_board);

    // If logic was not sufficient, fall back to the backtracking algorithm.
    if board_after_logic.cells.contains(&0) && !solver::solve(&mut board_after_logic) {
        return Err(JsValue::from_str("No solution found for the given puzzle."));
    }

    to_js(&SolveResult {
        steps,
        solution: Some(board_after_logic.to_string()),
    })
}

/// Generate a new Sudoku puzzle with a unique solution.
///
/// ### Arguments
///
/// * `difficulty_str` - A string representing the desired difficulty:
///   "easy", "medium", "hard", "expert", or "extreme".
///
/// ### Returns
///
/// * A `JsValue` containing the serialized `GeneratedPuzzle`.
///
/// ### Errors
///
/// * A `JsValue` error if the difficulty string is invalid.
#[wasm_bindgen]
pub fn generate_sudoku(difficulty_str: &str) -> Result<JsValue, JsValue> {
    let difficulty = match difficulty_str {
        "easy" => Difficulty::Easy,
        "medium" => Difficulty::Medium,
        "hard" => Difficulty::Hard,
        "expert" => Difficulty::Expert,
        "extreme" => Difficulty::Extreme,
        _ => return Err(JsValue::from_str("Invalid difficulty level.")),
    };

    let (puzzle, solution) = generate::generate(difficulty);
    to_js(&GeneratedPuzzle {
        puzzle: puzzle.to_string(),
        solution: solution.to_string(),
    })
}

/// Validate a Sudoku puzzle and return its solution when it is unique.
///
/// ### Arguments
///
/// * `board_str` - An 81-character string representing the Sudoku board.
///
/// ### Returns
///
/// * The 81-character solution if the puzzle has exactly one, `None` otherwise.
///
/// ### Errors
///
/// * A `JsValue` error if the input string is invalid.
#[wasm_bindgen]
pub fn validate_puzzle(board_str: &str) -> Result<Option<String>, JsValue> {
    let board: Board = board_str
        .parse::<Board>()
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    // Backtracking alone, since the logical solver's steps are not needed here.
    match solver::count_and_first_solution(&board) {
        (1, Some(solution)) => Ok(Some(solution.to_string())),
        _ => Ok(None),
    }
}
