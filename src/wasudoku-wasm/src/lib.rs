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

pub mod abi;
pub mod api;
pub mod board;
pub mod generate;
pub mod geometry;
pub mod logical_solver;
pub mod solver;
pub mod types;
#[cfg(feature = "legacy")]
mod utils;
pub mod wire;

use board::Board;
use types::SolvingStep;

#[cfg(feature = "legacy")]
pub use legacy::{GeneratedPuzzle, generate_sudoku, solve_sudoku, start, validate_puzzle};

/// The logical steps and the solution behind `solve_sudoku`, or `None` if the board has no solution.
pub fn solve_board(board: &Board) -> Option<(Vec<SolvingStep>, Board)> {
    // Counting proves a board without a solution fast, where the ordered search can take seconds.
    let (count, counted) = solver::count_with_solution(board);
    if count == 0 {
        return None;
    }
    let (steps, mut board_after_logic) = logical_solver::solve_with_steps(board);

    // If logic was not sufficient, take the counted solution when it is the only one.
    // With several, the ordered search keeps picking the one it always picked.
    if board_after_logic.cells.contains(&0) {
        if count == 1 {
            board_after_logic = counted?;
        } else if !solver::solve(&mut board_after_logic) {
            return None;
        }
    }
    Some((steps, board_after_logic))
}

/// The exports the app calls until cutover, which deletes this module.
#[cfg(feature = "legacy")]
mod legacy {
    use super::{solve_board, solver, utils};
    use crate::board::Board;
    use crate::generate::{self, Difficulty};
    use crate::types::SolveResult;
    use serde::{Deserialize, Serialize};
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
    pub fn start() {
        utils::set_panic_hook();
    }

    fn to_js<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(value).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// The steps and solution of an 81-character board, logic first and the search after.
    /// Errors with a message for a malformed or unsolvable board.
    #[wasm_bindgen]
    pub fn solve_sudoku(board_str: &str) -> Result<JsValue, JsValue> {
        let initial_board: Board = board_str
            .parse::<Board>()
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let (steps, solution) = solve_board(&initial_board)
            .ok_or_else(|| JsValue::from_str("No solution found for the given puzzle."))?;
        to_js(&SolveResult {
            steps,
            solution: Some(solution.to_string()),
        })
    }

    // Mirrors `DIFFICULTIES` in src/context/sudoku.types.ts, so tsc rejects a name missing here.
    #[wasm_bindgen(typescript_custom_section)]
    const DIFFICULTY_TS: &str =
        r#"export type Difficulty = "easy" | "medium" | "hard" | "expert" | "extreme";"#;

    /// A puzzle with a unique solution at a difficulty named in lower case.
    #[wasm_bindgen]
    pub fn generate_sudoku(
        #[wasm_bindgen(unchecked_param_type = "Difficulty")] difficulty_str: &str,
    ) -> Result<JsValue, JsValue> {
        let difficulty = difficulty_str
            .parse::<Difficulty>()
            .map_err(|e| JsValue::from_str(&e))?;

        let (puzzle, solution) = generate::generate(difficulty);
        to_js(&GeneratedPuzzle {
            puzzle: puzzle.to_string(),
            solution: solution.to_string(),
        })
    }

    /// The solution of an 81-character board when it has exactly one.
    #[wasm_bindgen]
    pub fn validate_puzzle(board_str: &str) -> Result<Option<String>, JsValue> {
        let board: Board = board_str
            .parse::<Board>()
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        // Backtracking alone, since the logical solver's steps are not needed here.
        Ok(solver::unique_solution(&board).map(|solution| solution.to_string()))
    }
}
