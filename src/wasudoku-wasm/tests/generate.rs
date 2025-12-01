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

use wasudoku_wasm::generate::{self, Difficulty};
use wasudoku_wasm::logical_solver::{self, TechniqueLevel};
use wasudoku_wasm::solver;

#[test]
fn test_generate_creates_valid_puzzle() {
    let puzzle = generate::generate(Difficulty::Easy);
    assert_eq!(
        solver::count_solutions(&puzzle),
        1,
        "Generated puzzle must have exactly one solution."
    );
    assert!(
        puzzle.cells.iter().any(|&c| c != 0),
        "Generated puzzle should not be empty."
    );
    assert!(
        puzzle.cells.iter().any(|&c| c == 0),
        "Generated puzzle should not be full."
    );
}

#[test]
fn test_generate_easy_puzzle_difficulty() {
    let puzzle = generate::generate(Difficulty::Easy);
    let (steps, _) = logical_solver::solve_with_steps(&puzzle);
    let stats = logical_solver::analyze_difficulty(&steps);

    assert_eq!(
        stats.max_level,
        TechniqueLevel::Basic,
        "Easy puzzle must be solvable with Basic techniques only, but was {:?}.",
        stats.max_level
    );
}

#[test]
fn test_generate_medium_puzzle_difficulty() {
    let puzzle = generate::generate(Difficulty::Medium);
    let (steps, _) = logical_solver::solve_with_steps(&puzzle);
    let stats = logical_solver::analyze_difficulty(&steps);

    assert_eq!(
        stats.max_level,
        TechniqueLevel::Intermediate,
        "Medium puzzle must be solvable with Intermediate techniques (and not just Basic), but was {:?}.",
        stats.max_level
    );
}

#[test]
fn test_generate_hard_puzzle_difficulty() {
    let puzzle = generate::generate(Difficulty::Hard);
    let (steps, solved_board) = logical_solver::solve_with_steps(&puzzle);
    let stats = logical_solver::analyze_difficulty(&steps);

    assert_eq!(
        stats.max_level,
        TechniqueLevel::Advanced,
        "Hard puzzle must require Advanced techniques (X-Wing/Swordfish), but was {:?}.",
        stats.max_level
    );

    assert!(
        solved_board.cells.iter().all(|&c| c != 0),
        "Hard puzzle must be fully solvable without backtracking."
    );
}

#[test]
fn test_generate_extreme_puzzle_difficulty() {
    let puzzle = generate::generate(Difficulty::Extreme);
    assert_eq!(
        solver::count_solutions(&puzzle),
        1,
        "Extreme puzzle must still have a unique solution."
    );

    let (_, solved_board) = logical_solver::solve_with_steps(&puzzle);

    let is_completely_solved = solved_board.cells.iter().all(|&c| c != 0);
    assert!(
        !is_completely_solved,
        "Extreme puzzle must NOT be completely solvable with only logic techniques (requires backtracking)."
    );
}
