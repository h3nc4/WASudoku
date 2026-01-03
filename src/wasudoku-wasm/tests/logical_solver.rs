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
use wasudoku_wasm::logical_solver::{self, LogicalBoard, TechniqueLevel, analyze_difficulty};
use wasudoku_wasm::types::{Elimination, SolvingStep};

fn board_from_str(s: &str) -> LogicalBoard {
    let simple_board: Board = s.parse().unwrap();
    LogicalBoard::from_board(&simple_board)
}

fn assert_nth_logical_step(
    puzzle_str: &str,
    step_index: usize,
    expected_technique: &str,
) -> SolvingStep {
    let initial_board: Board = puzzle_str.parse().unwrap();
    let (steps, _) = logical_solver::solve_with_steps(&initial_board);

    assert!(
        steps.len() > step_index,
        "Expected at least {} steps, but got {}",
        step_index + 1,
        steps.len()
    );
    let step = &steps[step_index];

    assert_eq!(step.technique, expected_technique);

    step.clone()
}

#[test]
fn test_candidate_initialization() {
    let puzzle_str =
        "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
    let board = board_from_str(puzzle_str);

    assert_eq!(board.candidates[0], 0);

    let mask_for_5 = 1 << 4;
    assert_eq!(board.candidates[2] & mask_for_5, 0);

    let mask_for_1 = 1 << 0;
    assert_ne!(board.candidates[2] & mask_for_1, 0);
}

#[test]
fn test_naked_single_step_generation() {
    let puzzle_str =
        "...2..7...5..96832.8.7....641.....78.2..745..7.31854....2531..4.3164..5...9...61.";
    let first_step = assert_nth_logical_step(puzzle_str, 0, "NakedSingle");

    assert_eq!(first_step.placements[0].index, 9);
    assert_eq!(first_step.placements[0].value, 1);

    let has_elimination_for_cell_0 = first_step
        .eliminations
        .iter()
        .any(|e| e.index == 0 && e.value == 1);
    assert!(
        has_elimination_for_cell_0,
        "Expected elimination of 1 at index 0"
    );
}

#[test]
fn test_hidden_single_detection_in_box() {
    let puzzle_str =
        ".38.917.571...38.9...78.3419738526148649175325213..9781..67..83386.29.57..7.38.96";
    let first_step = assert_nth_logical_step(puzzle_str, 0, "HiddenSingle");

    assert_eq!(first_step.placements[0].index, 0);
    assert_eq!(first_step.placements[0].value, 4);

    let elims: Vec<&Elimination> = first_step
        .eliminations
        .iter()
        .filter(|e| e.index == 0)
        .collect();
    assert_eq!(elims.len(), 2, "Expected 2 eliminations from cell 0");
    assert!(elims.iter().any(|e| e.value == 2));
    assert!(elims.iter().any(|e| e.value == 6));
}

#[test]
fn test_hidden_single_with_naked_single_scenario() {
    // Manually construct a scenario where a cell is a Hidden Single but has no other candidates.
    let puzzle_str =
        ".23456789456789123789123456214365897365897214897214365531642978642978531978531642";
    let board = board_from_str(puzzle_str);

    // Call find_hidden_single directly
    let step = logical_solver::basic::find_hidden_single(&board);

    assert!(step.is_some());
    let s = step.unwrap();
    assert_eq!(s.technique, "HiddenSingle");
    assert_eq!(s.placements[0].index, 0);
    assert_eq!(s.placements[0].value, 1);

    let self_elims = s.eliminations.iter().filter(|e| e.index == 0).count();
    assert_eq!(
        self_elims, 0,
        "Should have 0 internal eliminations because other_cands was 0"
    );
}

#[test]
fn test_naked_pair_detection() {
    let puzzle_str =
        ".....8..5..97...1..1.....687.51..........3..46......57.6...5.9..8........4.9.....";
    let step = assert_nth_logical_step(puzzle_str, 31, "NakedPair");

    assert_eq!(step.cause.len(), 2);
    assert!(step.cause.iter().any(|c| c.index == 14));
    assert!(step.cause.iter().any(|c| c.index == 32));

    let mut cause_cands = step.cause[0].candidates.clone();
    cause_cands.sort();
    assert_eq!(cause_cands, vec![4, 6]);

    assert!(
        step.eliminations
            .iter()
            .any(|e| e.index == 68 && e.value == 4)
    );
}

#[test]
fn test_pointing_pair_detection() {
    let puzzle_str =
        ".....8..5..97...1..1.....687.51..........3..46......57.6...5.9..8........4.9.....";
    let step = assert_nth_logical_step(puzzle_str, 32, "PointingPair");

    assert_eq!(step.cause.len(), 2);
    assert!(step.cause.iter().any(|c| c.index == 15));
    assert!(step.cause.iter().any(|c| c.index == 17));
    assert_eq!(step.cause[0].candidates, vec![2]);

    assert!(
        step.eliminations
            .iter()
            .any(|e| e.index == 13 && e.value == 2)
    );
}

#[test]
fn test_claiming_candidate_detection() {
    let puzzle_str =
        "7356814..681492.3.4..7356813.71..9.894..73.1.1....937.5.4318...8.392.15.21.5.78.3";
    let initial_board: Board = puzzle_str.parse().unwrap();
    let (steps, _) = logical_solver::solve_with_steps(&initial_board);

    let step = steps
        .iter()
        .find(|s| s.technique == "ClaimingCandidate")
        .expect("Expected a ClaimingCandidate step");

    assert!(!step.eliminations.is_empty());
    assert!(step.cause.len() >= 2);
}

#[test]
fn test_hidden_pair_detection() {
    let puzzle_str =
        "538421769421769...769538....8.17.6.2..29........28.3..857312946...6.71...1.8...7.";
    let initial_board: Board = puzzle_str.parse().unwrap();
    let (steps, _) = logical_solver::solve_with_steps(&initial_board);

    let has_hidden_pair = steps.iter().any(|s| s.technique == "HiddenPair");
    assert!(has_hidden_pair, "Expected HiddenPair technique usage");
}

#[test]
fn test_naked_triple_detection() {
    let puzzle_str =
        ".613.5.8.3.5.8.26..8..6.3.561254....8....615.5..9.....12..5...893....5..75...2.4.";
    let initial_board: Board = puzzle_str.parse().unwrap();
    let (steps, _) = logical_solver::solve_with_steps(&initial_board);

    let has_naked_triple = steps.iter().any(|s| s.technique == "NakedTriple");
    assert!(has_naked_triple, "Expected NakedTriple technique usage");
}

#[test]
fn test_pointing_triple_detection() {
    let puzzle_str =
        "6...5481.9.48136..81.62...42.648....18.36274.4..5.1268.68..5...5.2.38..6..1..658.";
    let initial_board: Board = puzzle_str.parse().unwrap();
    let (steps, _) = logical_solver::solve_with_steps(&initial_board);

    let has_pointing_triple = steps.iter().any(|s| s.technique == "PointingTriple");
    assert!(
        has_pointing_triple,
        "Expected PointingTriple technique usage"
    );
}

#[test]
fn test_x_wing_detection() {
    let puzzle_str =
        "3..6148726148723958723956......86......2.95....6.5...85..9..2...6..2..5.24756.1.9";
    let initial_board: Board = puzzle_str.parse().unwrap();
    let (steps, _) = logical_solver::solve_with_steps(&initial_board);

    let step = steps
        .iter()
        .find(|s| s.technique == "X-Wing")
        .expect("Expected an X-Wing step");

    let x_wing_val = step.cause[0].candidates[0];
    assert_eq!(x_wing_val, 3, "X-Wing should be for candidate 3");
    assert!(
        !step.eliminations.is_empty(),
        "X-Wing should yield eliminations"
    );
}

#[test]
fn test_swordfish_detection() {
    let puzzle_str =
        "4..6...95.2..95478.954..6..........2.125.7.3.3..2......417.256.26795....53..64..7";
    let initial_board: Board = puzzle_str.parse().unwrap();
    let (steps, _) = logical_solver::solve_with_steps(&initial_board);

    let has_swordfish = steps.iter().any(|s| s.technique == "Swordfish");
    assert!(has_swordfish, "Expected Swordfish technique usage");
}

#[test]
fn test_xy_wing_detection() {
    let puzzle_str =
        "68.5172.451.2946....468351.8.67.59419.14683.5.451.986..628.14..1.89427.64..3.61..";
    let initial_board: Board = puzzle_str.parse().unwrap();
    let (steps, _) = logical_solver::solve_with_steps(&initial_board);

    let has_xy_wing = steps.iter().any(|s| s.technique == "XY-Wing");
    assert!(has_xy_wing, "Expected XY-Wing technique usage");
}

#[test]
fn test_xyz_wing_detection() {
    let puzzle_str =
        ".92..175.5..2....8....3.2...75..496.2...6..75.697...3...8.9..2.7....3.899.38...4.";
    let initial_board: Board = puzzle_str.parse().unwrap();
    let (steps, _) = logical_solver::solve_with_steps(&initial_board);

    let has_xyz_wing = steps.iter().any(|s| s.technique == "XYZ-Wing");
    assert!(has_xyz_wing, "Expected XYZ-Wing technique usage");
}

#[test]
fn test_skyscraper_detection() {
    let puzzle_str =
        ".89.2....2..5.94.8...8..9.21629875..5..4.2.89948....2.79.2.83..32.6..89.8...9.2..";
    let initial_board: Board = puzzle_str.parse().unwrap();
    let (steps, _) = logical_solver::solve_with_steps(&initial_board);

    let has_skyscraper = steps.iter().any(|s| s.technique == "Skyscraper");
    assert!(has_skyscraper, "Expected Skyscraper technique usage");
}

#[test]
fn test_two_string_kite_detection() {
    let puzzle_str =
        ".89.2....2..5.94.8...8..9.21629875..5..4.2.89948....2.79.2.83..32.6..89.8...9.2..";
    let initial_board: Board = puzzle_str.parse().unwrap();
    let (steps, _) = logical_solver::solve_with_steps(&initial_board);

    let has_kite = steps.iter().any(|s| s.technique == "TwoStringKite");
    assert!(has_kite, "Expected Two-String Kite technique usage");
}

#[test]
fn test_jellyfish_detection() {
    // A known pattern that requires a Jellyfish.
    let puzzle_str =
        "4..2....9..16...7..8.4....17.4....9.....4.....9....7.65....3.2..2...61..9....4..7";
    let initial_board: Board = puzzle_str.parse().unwrap();
    let (steps, _) = logical_solver::solve_with_steps(&initial_board);

    let has_jellyfish = steps.iter().any(|s| s.technique == "Jellyfish");
    assert!(has_jellyfish, "Expected Jellyfish technique usage");
}

#[test]
fn test_unique_rectangle_type1_detection() {
    // A specific layout that has a deadly pattern UR Type 1
    let puzzle_str =
        ".....3....4.91.7..9.6....43.2......4...675...3......7.27....6.1..5.69.2....2.....";
    let initial_board: Board = puzzle_str.parse().unwrap();
    let (steps, _) = logical_solver::solve_with_steps(&initial_board);

    let has_ur = steps.iter().any(|s| s.technique == "UniqueRectangleType1");
    assert!(has_ur, "Expected Unique Rectangle Type 1 technique usage");
}

#[test]
fn test_w_wing_detection() {
    // Puzzle known to require W-Wing
    let puzzle_str =
        "4..2....9..16...7..8.4....17.4....9.....4.....9....7.65....3.2..2...61..9....4..7";
    let initial_board: Board = puzzle_str.parse().unwrap();
    let (steps, _) = logical_solver::solve_with_steps(&initial_board);

    let has_w_wing = steps.iter().any(|s| s.technique == "W-Wing");
    assert!(has_w_wing, "Expected W-Wing technique usage");
}

#[test]
fn test_logical_board_set_cell_returns_false_if_filled() {
    let mut board = LogicalBoard {
        cells: [0; 81],
        candidates: [0; 81],
    };
    board.cells[0] = 5;
    let result = board.set_cell(0, 1);
    assert!(
        !result,
        "set_cell should return false if cell is already filled"
    );
}

#[test]
fn test_analyze_difficulty_classification() {
    let steps = vec![
        SolvingStep {
            technique: "Jellyfish".to_string(),
            placements: vec![],
            eliminations: vec![],
            cause: vec![],
        },
        SolvingStep {
            technique: "UniqueRectangleType1".to_string(),
            placements: vec![],
            eliminations: vec![],
            cause: vec![],
        },
        SolvingStep {
            technique: "W-Wing".to_string(),
            placements: vec![],
            eliminations: vec![],
            cause: vec![],
        },
        SolvingStep {
            technique: "UnknownTechnique".to_string(),
            placements: vec![],
            eliminations: vec![],
            cause: vec![],
        },
    ];

    let stats = analyze_difficulty(&steps);

    assert_eq!(stats.max_level, TechniqueLevel::Master);
    assert_eq!(stats.master_count, 3);
}

#[test]
fn test_hidden_triple_found() {
    // Construct a logical board where {1, 2, 3} form a Hidden Triple in Row 0.

    let mut board = LogicalBoard {
        cells: [0; 81],
        candidates: [0; 81],
    };

    // Initialize Row 0 indices manually since ROW_UNITS is not pub
    let row_indices: Vec<usize> = (0..9).collect();

    // Set cells 0, 1, 2 to contain {1, 2, 3} + {9}
    // {1,2,3,9} = 1 | 2 | 4 | 256 = 263
    let hidden_mask = 1 | 2 | 4 | 256;
    board.candidates[row_indices[0]] = hidden_mask;
    board.candidates[row_indices[1]] = hidden_mask;
    board.candidates[row_indices[2]] = hidden_mask;

    // Set other cells in Row 0 to contain only {4, 5, 6, 7, 8} (Mask: 496)
    // {4,5,6,7,8} = 8 | 16 | 32 | 64 | 128 = 248
    let other_mask = 8 | 16 | 32 | 64 | 128;
    for i in 3..9 {
        board.candidates[row_indices[i]] = other_mask;
    }

    // Fill the rest of the board with empty/full candidates to avoid interference
    // ALL_CANDIDATES is 0b111111111 = 511
    for i in 9..81 {
        board.candidates[i] = 511;
    }

    let step =
        logical_solver::subsets::find_hidden_triple(&board).expect("Should find HiddenTriple");

    assert_eq!(step.technique, "HiddenTriple");
    assert_eq!(step.cause.len(), 3);
    // Should eliminate '9' from cells 0, 1, 2
    assert_eq!(step.eliminations.len(), 3);
    assert!(step.eliminations.iter().all(|e| e.value == 9));
}
