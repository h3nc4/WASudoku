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

//! The solver's API as plain Rust, which the exports encode with `wire` and nothing more.
//! A board is 81 bytes, one per cell in reading order, `0` for an empty cell.

use crate::board::Board;
use crate::generate::{self, Difficulty};
use crate::geometry::{CELLS, MAX_DIGIT, PEERS};
use crate::logical_solver;
use crate::solver::{self, Budget, SearchLimit};
use crate::types::SolvingStep;

/// The guesses one backtracking search may make, above the 1,526,539 of the slowest known board.
/// That board takes 0.26 s natively, so a search stops well short of a second.
pub const SEARCH_BUDGET: Budget = 1 << 21;

/// Why a request failed, as the code the wire format carries.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiError {
    /// The board is not 81 bytes.
    BadLength = 1,
    /// A cell byte is above 9.
    BadDigit = 2,
    /// A unit repeats a digit among its givens.
    Conflict = 3,
    /// The board has no solution.
    NoSolution = 4,
    /// The search gave up after `SEARCH_BUDGET` guesses.
    SearchLimit = 5,
    /// The difficulty code is out of range.
    BadDifficulty = 6,
}

impl From<SearchLimit> for ApiError {
    fn from(_: SearchLimit) -> Self {
        ApiError::SearchLimit
    }
}

/// The logical steps of a solve and the board they and the search end on.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Solved {
    pub steps: Vec<SolvingStep>,
    pub solution: Board,
}

/// What a board's givens allow.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Validation {
    /// Exactly one solution.
    Unique(Board),
    /// No solution, though no two givens conflict.
    Unsolvable,
    /// Two or more solutions.
    Several,
    /// The givens that share a unit with an equal given, in ascending order.
    Conflict(Vec<u8>),
}

/// A generated puzzle, the solution it was carved from and the difficulty it was graded at.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Generated {
    pub puzzle: Board,
    pub solution: Board,
    pub difficulty: Difficulty,
}

/// The next thing a player can be told about a board.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Hint {
    /// The first logical step.
    Step(SolvingStep),
    /// Logic cannot take a step, so only the solution can help.
    Stuck(Board),
}

/// Read a board, checking its length and digits but not its givens.
pub fn parse(cells: &[u8]) -> Result<Board, ApiError> {
    let cells: [u8; CELLS] = cells.try_into().map_err(|_| ApiError::BadLength)?;
    if cells.iter().any(|&digit| digit > MAX_DIGIT) {
        return Err(ApiError::BadDigit);
    }
    Ok(Board { cells })
}

/// The givens of `board` that share a unit with an equal given, in ascending order.
pub fn conflicts(board: &Board) -> Vec<u8> {
    let cells = &board.cells;
    (0..CELLS)
        .filter(|&i| cells[i] != 0 && PEERS[i].iter().any(|&p| cells[usize::from(p)] == cells[i]))
        .filter_map(|i| u8::try_from(i).ok())
        .collect()
}

/// Read a board whose givens do not conflict.
fn parse_playable(cells: &[u8]) -> Result<Board, ApiError> {
    let board = parse(cells)?;
    if conflicts(&board).is_empty() {
        Ok(board)
    } else {
        Err(ApiError::Conflict)
    }
}

/// Count the solutions of `board` up to two, failing on none.
fn count(board: &Board, budget: Budget) -> Result<(u8, Option<Board>), ApiError> {
    match solver::count_within(board, budget)? {
        (0, _) => Err(ApiError::NoSolution),
        counted => Ok(counted),
    }
}

/// The solution of `board`: the counted one when it is unique, else the first the ordered search finds.
fn solution_of(
    board: &Board,
    counted: (u8, Option<Board>),
    budget: Budget,
) -> Result<Board, ApiError> {
    match counted {
        (1, Some(solution)) => Ok(solution),
        _ => solver::solve_within(board, budget)?.ok_or(ApiError::NoSolution),
    }
}

/// The logical steps and the solution of a board, with the search finishing what logic cannot.
/// A board with several solutions ends on the one `solver::solve` picks after the steps.
pub fn solve(cells: &[u8]) -> Result<Solved, ApiError> {
    solve_within(cells, SEARCH_BUDGET)
}

/// `solve`, with each search giving up after `budget` guesses.
pub fn solve_within(cells: &[u8], budget: Budget) -> Result<Solved, ApiError> {
    let board = parse_playable(cells)?;
    let counted = count(&board, budget)?;
    let (steps, after) = logical_solver::solve_with_steps(&board);
    let solution = if after.cells.contains(&0) {
        solution_of(&after, counted, budget)?
    } else {
        after
    };
    Ok(Solved { steps, solution })
}

/// Whether a board has one solution, none, several, or givens that conflict.
pub fn validate(cells: &[u8]) -> Result<Validation, ApiError> {
    validate_within(cells, SEARCH_BUDGET)
}

/// `validate`, with the search giving up after `budget` guesses.
pub fn validate_within(cells: &[u8], budget: Budget) -> Result<Validation, ApiError> {
    let board = parse(cells)?;
    let conflicting = conflicts(&board);
    if !conflicting.is_empty() {
        return Ok(Validation::Conflict(conflicting));
    }
    Ok(match solver::count_within(&board, budget)? {
        (1, Some(solution)) => Validation::Unique(solution),
        (0, _) => Validation::Unsolvable,
        _ => Validation::Several,
    })
}

/// A puzzle of `difficulty`, the same one for the same seed.
pub fn generate(difficulty: Difficulty, seed: u64) -> Generated {
    let (puzzle, solution) = generate::generate_with_seed(difficulty, seed);
    Generated {
        puzzle,
        solution,
        difficulty,
    }
}

/// The difficulty of a wire code.
pub fn difficulty(code: u8) -> Result<Difficulty, ApiError> {
    Difficulty::from_code(code).ok_or(ApiError::BadDifficulty)
}

/// The first logical step on a board, or its solution when logic is stuck.
pub fn next_step(cells: &[u8]) -> Result<Hint, ApiError> {
    next_step_within(cells, SEARCH_BUDGET)
}

/// `next_step`, with each search giving up after `budget` guesses.
pub fn next_step_within(cells: &[u8], budget: Budget) -> Result<Hint, ApiError> {
    let board = parse_playable(cells)?;
    let counted = count(&board, budget)?;
    match logical_solver::next_step(&board) {
        Some(step) => Ok(Hint::Step(step)),
        None => solution_of(&board, counted, budget).map(Hint::Stuck),
    }
}
