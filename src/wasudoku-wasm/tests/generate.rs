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

use wasudoku_wasm::generate::{self, Difficulty};
use wasudoku_wasm::logical_solver::{self, TechniqueLevel};
use wasudoku_wasm::solver;

#[test]
fn test_difficulty_parses_each_frontend_name() {
    let names = ["easy", "medium", "hard", "expert", "extreme"];
    let parsed: Vec<Difficulty> = names.iter().map(|n| n.parse().unwrap()).collect();
    assert_eq!(
        parsed,
        [
            Difficulty::Easy,
            Difficulty::Medium,
            Difficulty::Hard,
            Difficulty::Expert,
            Difficulty::Extreme,
        ]
    );
}

#[test]
fn test_difficulty_rejects_unknown_name() {
    assert_eq!(
        "Easy".parse::<Difficulty>(),
        Err("Invalid difficulty level.".to_string())
    );
}

#[test]
fn test_generate_creates_valid_puzzle() {
    let (puzzle, _) = generate::generate(Difficulty::Easy);
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
        puzzle.cells.contains(&0),
        "Generated puzzle should not be full."
    );
}

#[test]
fn test_generate_returns_solution_of_puzzle() {
    let (puzzle, solution) = generate::generate(Difficulty::Extreme);
    let mut solved = puzzle;
    assert!(solver::solve(&mut solved));
    assert_eq!(solved.cells, solution.cells);
    assert!(
        puzzle
            .cells
            .iter()
            .zip(solution.cells.iter())
            .all(|(&p, &s)| p == 0 || p == s),
        "Every clue must match the solution."
    );
}

#[test]
fn test_generate_easy_puzzle_difficulty() {
    let (puzzle, _) = generate::generate(Difficulty::Easy);
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
    let (puzzle, _) = generate::generate(Difficulty::Medium);
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
    let (puzzle, _) = generate::generate(Difficulty::Hard);
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
fn test_generate_expert_puzzle_difficulty() {
    let (puzzle, _) = generate::generate(Difficulty::Expert);
    let (steps, solved_board) = logical_solver::solve_with_steps(&puzzle);
    let stats = logical_solver::analyze_difficulty(&steps);

    assert_eq!(
        stats.max_level,
        TechniqueLevel::Master,
        "Expert puzzle must require Master techniques, but was {:?}.",
        stats.max_level
    );

    assert!(
        solved_board.cells.iter().all(|&c| c != 0),
        "Expert puzzle must be fully solvable with logic."
    );
}

#[test]
fn test_generate_extreme_puzzle_difficulty() {
    let (puzzle, _) = generate::generate(Difficulty::Extreme);
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

// Run with `cargo test --release --test generate -- --ignored --nocapture`, N from BENCH_N.
#[test]
#[ignore]
fn bench_generate_per_difficulty() {
    let n: usize = std::env::var("BENCH_N")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);
    for difficulty in [
        Difficulty::Easy,
        Difficulty::Medium,
        Difficulty::Hard,
        Difficulty::Expert,
        Difficulty::Extreme,
    ] {
        let mut times: Vec<f64> = (0..n)
            .map(|_| {
                let start = std::time::Instant::now();
                std::hint::black_box(generate::generate(difficulty));
                start.elapsed().as_secs_f64() * 1000.0
            })
            .collect();
        times.sort_by(f64::total_cmp);
        let mean = times.iter().sum::<f64>() / n as f64;
        println!(
            "{:?}: n={} mean={:.1}ms median={:.1}ms min={:.1}ms max={:.1}ms",
            difficulty,
            n,
            mean,
            times[n / 2],
            times[0],
            times[n - 1]
        );
    }
}
