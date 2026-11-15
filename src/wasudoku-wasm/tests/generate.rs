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

use rand::SeedableRng;
use rand::rngs::StdRng;
use std::hash::{DefaultHasher, Hash, Hasher};
use wasudoku_wasm::generate::{self, Difficulty};
use wasudoku_wasm::logical_solver::{self, TechniqueLevel};
use wasudoku_wasm::solver;

const ALL_DIFFICULTIES: [Difficulty; 5] = [
    Difficulty::Easy,
    Difficulty::Medium,
    Difficulty::Hard,
    Difficulty::Expert,
    Difficulty::Extreme,
];

/// Any seed, so a failure always replays.
const SEED: u64 = 7;

#[test]
fn test_generate_creates_valid_puzzle() {
    let (puzzle, _) = generate::generate_with_seed(Difficulty::Easy, SEED);
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
    let (puzzle, solution) = generate::generate_with_seed(Difficulty::Extreme, SEED);
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
    let (puzzle, _) = generate::generate_with_seed(Difficulty::Easy, SEED);
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
    let (puzzle, _) = generate::generate_with_seed(Difficulty::Medium, SEED);
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
    let (puzzle, _) = generate::generate_with_seed(Difficulty::Hard, SEED);
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
    let (puzzle, _) = generate::generate_with_seed(Difficulty::Expert, SEED);
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
    let (puzzle, _) = generate::generate_with_seed(Difficulty::Extreme, SEED);
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

#[test]
fn test_generate_with_seed_is_reproducible() {
    for difficulty in ALL_DIFFICULTIES {
        let (puzzle, solution) = generate::generate_with_seed(difficulty, 1);
        let (again, again_solution) = generate::generate_with_seed(difficulty, 1);
        assert_eq!(puzzle.cells, again.cells, "{difficulty:?} puzzle differs");
        assert_eq!(
            solution.cells, again_solution.cells,
            "{difficulty:?} solution differs"
        );

        let (other, _) = generate::generate_with_seed(difficulty, 2);
        assert_ne!(puzzle.cells, other.cells, "{difficulty:?} ignores the seed");
    }
}

// Generated before unit branching reached the counting search, which has to leave every count unchanged.
const SEED_1_PUZZLES: [(Difficulty, &str); 5] = [
    (
        Difficulty::Easy,
        ".4685...9.5...9.4.2.9..6.53......79.7.......8.98......61.4..9.7.8.7...6.9...8152.",
    ),
    (
        Difficulty::Medium,
        "..87.291.7.2.1.....1...8.3..86.......93...82.......56..6.5...7.....4.2.6.218.63..",
    ),
    (
        Difficulty::Hard,
        "81..7......453...65....6.7..6.4....73.......24....3.8..8.1....37...954......2..51",
    ),
    (
        Difficulty::Expert,
        "..185.9......4.631..2..1.5...6.....5.95.6.17.7.....3...6.3..2..583.2......4.865..",
    ),
    (
        Difficulty::Extreme,
        ".....3....8..5.2..754.9.....62..1..8.7.....3.3..8..92.....3.415..9.4..6....6.....",
    ),
];

#[test]
fn test_seeded_puzzles_are_unchanged() {
    for (difficulty, expected) in SEED_1_PUZZLES {
        let (puzzle, _) = generate::generate_with_seed(difficulty, 1);
        assert_eq!(puzzle.to_string(), expected, "{difficulty:?}");
    }
}

#[test]
fn test_seeded_puzzles_are_unique() {
    for difficulty in ALL_DIFFICULTIES {
        for seed in 0..5 {
            let (puzzle, solution) = generate::generate_with_seed(difficulty, seed);
            let unique = solver::unique_solution(&puzzle);
            assert!(unique.is_some(), "{difficulty:?} seed {seed} is not unique");
            assert!(unique.unwrap().cells == solution.cells);
        }
    }
}

fn env_or<T: std::str::FromStr>(name: &str, default: T) -> T {
    std::env::var(name)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

// Run with `cargo test --release --test generate -- --ignored --nocapture`, N from BENCH_N.
#[test]
#[ignore]
fn bench_generate_per_difficulty() {
    let n: usize = env_or("BENCH_N", 10);
    // BENCH_SEED fixes the puzzles, so equal seeds print equal fingerprints.
    let seed: u64 = env_or("BENCH_SEED", 2026);
    println!("seed={seed}");
    for difficulty in ALL_DIFFICULTIES {
        let mut rng = StdRng::seed_from_u64(seed);
        let mut fingerprint = DefaultHasher::new();
        let mut times: Vec<f64> = (0..n)
            .map(|_| {
                let start = std::time::Instant::now();
                let (puzzle, solution) = generate::generate_with_rng(difficulty, &mut rng);
                let elapsed = start.elapsed().as_secs_f64() * 1000.0;
                (puzzle.cells, solution.cells).hash(&mut fingerprint);
                elapsed
            })
            .collect();
        times.sort_by(f64::total_cmp);
        let mean = times.iter().sum::<f64>() / n as f64;
        println!(
            "{:?}: n={} mean={:.1}ms median={:.1}ms p90={:.1}ms min={:.1}ms max={:.1}ms fingerprint={:016x}",
            difficulty,
            n,
            mean,
            times[n / 2],
            times[n * 9 / 10],
            times[0],
            times[n - 1],
            fingerprint.finish()
        );
    }
}
