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

//! A logical Sudoku solver that uses human-like techniques.
//! This module acts as the orchestrator, delegating specific technique checks to submodules.

pub mod basic;
pub mod fish;
pub mod intersection;
pub mod single_digit;
pub mod subsets;
pub mod uniqueness;
pub mod wings;

use crate::board::Board;
use crate::types::SolvingStep;
use std::collections::HashSet;

/// Bitmask representing all candidates (1-9) for a cell.
pub(crate) const ALL_CANDIDATES: u16 = 0b111111111;

// Pre-calculate and cache indices for all rows, columns, boxes, and peer cells.
lazy_static::lazy_static! {
    pub(crate) static ref ROW_UNITS: [[usize; 9]; 9] = {
        let mut units = [[0; 9]; 9];
        for (i, row) in units.iter_mut().enumerate() {
            for (j, cell) in row.iter_mut().enumerate() {
                *cell = i * 9 + j;
            }
        }
        units
    };
    pub(crate) static ref COL_UNITS: [[usize; 9]; 9] = {
        let mut units = [[0; 9]; 9];
        for (i, row) in units.iter_mut().enumerate() {
            for (j, cell) in row.iter_mut().enumerate() {
                *cell = j * 9 + i;
            }
        }
        units
    };
    pub(crate) static ref BOX_UNITS: [[usize; 9]; 9] = {
        let mut units = [[0; 9]; 9];
        for (i, unit) in units.iter_mut().enumerate() {
            let start_row = (i / 3) * 3;
            let start_col = (i % 3) * 3;
            for (j, cell) in unit.iter_mut().enumerate() {
                *cell = (start_row + j / 3) * 9 + (start_col + j % 3);
            }
        }
        units
    };
    /// A collection of all 27 units (9 rows, 9 columns, 9 boxes).
    pub(crate) static ref ALL_UNITS: Vec<&'static [usize]> = {
        let mut units = Vec::with_capacity(27);
        units.extend(ROW_UNITS.iter().map(|u| &u[..]));
        units.extend(COL_UNITS.iter().map(|u| &u[..]));
        units.extend(BOX_UNITS.iter().map(|u| &u[..]));
        units
    };
    /// A map from a cell index to a vector of its 20 peers.
    pub(crate) static ref PEER_MAP: [Vec<usize>; 81] = {
        let mut map = [(); 81].map(|_| Vec::with_capacity(20));
        for (i, peers_vec) in map.iter_mut().enumerate() {
            let mut peers = HashSet::new();
            let row = i / 9;
            let col = i % 9;

            for c in 0..9 { peers.insert(row * 9 + c); }
            for r in 0..9 { peers.insert(r * 9 + col); }
            let start_row = (row / 3) * 3;
            let start_col = (col / 3) * 3;
            for r_offset in 0..3 {
                for c_offset in 0..3 {
                    peers.insert((start_row + r_offset) * 9 + (start_col + c_offset));
                }
            }
            peers.remove(&i);
            *peers_vec = peers.into_iter().collect();
        }
        map
    };
}

/// Represents the logical difficulty of a solving technique.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum TechniqueLevel {
    None,         // No logical moves found
    Basic,        // Naked/Hidden Singles
    Intermediate, // Pointing Subsets, Naked/Hidden Pairs/Triples, Box-Line Reduction
    Advanced,     // X-Wing, Swordfish, XY-Wing, XYZ-Wing, Skyscraper, 2-String Kite
    Master,       // Jellyfish, Unique Rectangle, W-Wing
}

/// Stats for difficulty analysis
pub struct DifficultyStats {
    pub max_level: TechniqueLevel,
    pub intermediate_count: usize,
    pub advanced_count: usize,
    pub master_count: usize,
}

/// Convert a bitmask of candidates into a `Vec` of numbers.
#[inline]
pub(crate) fn mask_to_vec(mask: u16) -> Vec<u8> {
    (1..=9)
        .filter(|&num| (mask >> (num - 1)) & 1 == 1)
        .collect()
}

/// A Sudoku board with candidate tracking for logical solving.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct LogicalBoard {
    /// The definitive numbers on the board (0 for empty).
    pub cells: [u8; 81],
    /// A bitmask for each cell representing possible candidates (1-9).
    /// A `0` indicates the cell is filled.
    pub candidates: [u16; 81],
}

impl LogicalBoard {
    /// Initializes a LogicalBoard calculating candidates based on existing values.
    pub fn from_board(board: &Board) -> Self {
        let mut logical_board = LogicalBoard {
            cells: board.cells,
            candidates: [0; 81],
        };

        // Initialize candidates for all empty cells.
        for i in 0..81 {
            if logical_board.cells[i] == 0 {
                logical_board.candidates[i] = ALL_CANDIDATES;
            }
        }

        // Propagate constraints from existing numbers.
        for i in 0..81 {
            if logical_board.cells[i] != 0 {
                logical_board.eliminate_from_peers(i, logical_board.cells[i]);
            }
        }
        logical_board
    }

    /// Sets a cell value and eliminates that value from peers. Returns true if successful.
    pub fn set_cell(&mut self, index: usize, value: u8) -> bool {
        if self.cells[index] != 0 {
            return false;
        }
        self.cells[index] = value;
        self.candidates[index] = 0;
        self.eliminate_from_peers(index, value);
        true
    }

    /// Removes a value from the candidate masks of all peers of the given index.
    fn eliminate_from_peers(&mut self, index: usize, value: u8) {
        let elimination_mask = !(1 << (value - 1));
        for &peer_index in &PEER_MAP[index] {
            self.candidates[peer_index] &= elimination_mask;
        }
    }

    /// Pre-calculates fish masks for all numbers at once in a single board pass.
    /// Returns ([num][row_idx] -> mask, [num][col_idx] -> mask).
    /// This is used by Fish, Skyscraper, and Two-String Kite.
    pub(crate) fn get_all_fish_masks(&self) -> ([[u16; 9]; 10], [[u16; 9]; 10]) {
        let mut row_masks = [[0u16; 9]; 10];
        let mut col_masks = [[0u16; 9]; 10];

        for i in 0..81 {
            if self.cells[i] == 0 {
                let r = i / 9;
                let c = i % 9;
                let mut val = self.candidates[i];
                while val > 0 {
                    let trailing = val.trailing_zeros();
                    let num = (trailing + 1) as usize;
                    row_masks[num][r] |= 1 << c;
                    col_masks[num][c] |= 1 << r;
                    val &= !(1 << trailing);
                }
            }
        }
        (row_masks, col_masks)
    }
}

/// Solve the board by repeatedly applying logical techniques and return the steps.
pub fn solve_with_steps(initial_board: &Board) -> (Vec<SolvingStep>, Board) {
    let mut board = LogicalBoard::from_board(initial_board);
    let mut steps = Vec::new();

    loop {
        // Try techniques in order of complexity/speed
        let progress = try_apply_step(&mut board, &mut steps, basic::find_naked_single)
            || try_apply_step(&mut board, &mut steps, basic::find_hidden_single)
            || try_apply_step(&mut board, &mut steps, subsets::find_naked_pair)
            || try_apply_step(&mut board, &mut steps, subsets::find_naked_triple)
            || try_apply_step(&mut board, &mut steps, intersection::find_pointing_subset)
            || try_apply_step(&mut board, &mut steps, subsets::find_hidden_pair)
            || try_apply_step(&mut board, &mut steps, subsets::find_hidden_triple)
            || try_apply_step(&mut board, &mut steps, intersection::find_claiming_candidates)
            // Advanced Techniques
            || try_apply_step(&mut board, &mut steps, fish::find_fish_techniques)
            || try_apply_step(&mut board, &mut steps, wings::find_xy_wing)
            || try_apply_step(&mut board, &mut steps, wings::find_xyz_wing)
            || try_apply_step(&mut board, &mut steps, single_digit::find_skyscraper)
            || try_apply_step(&mut board, &mut steps, single_digit::find_two_string_kite)
            // Master Techniques
            || try_apply_step(&mut board, &mut steps, uniqueness::find_unique_rectangle_type_1)
            || try_apply_step(&mut board, &mut steps, wings::find_w_wing);

        if !progress {
            break;
        }
    }

    (steps, Board { cells: board.cells })
}

/// Helper to apply a step if one is found.
fn try_apply_step(
    board: &mut LogicalBoard,
    steps: &mut Vec<SolvingStep>,
    finder: fn(&LogicalBoard) -> Option<SolvingStep>,
) -> bool {
    if let Some(step) = finder(board) {
        // Apply placements
        for placement in &step.placements {
            board.set_cell(placement.index, placement.value);
        }
        // Apply eliminations
        for elim in &step.eliminations {
            board.candidates[elim.index] &= !(1 << (elim.value - 1));
        }
        steps.push(step);
        return true;
    }
    false
}

/// Analyzes the steps to count technique levels.
pub fn analyze_difficulty(steps: &[SolvingStep]) -> DifficultyStats {
    let mut stats = DifficultyStats {
        max_level: TechniqueLevel::None,
        intermediate_count: 0,
        advanced_count: 0,
        master_count: 0,
    };

    for step in steps {
        let level = match step.technique.as_str() {
            "NakedSingle" | "HiddenSingle" => TechniqueLevel::Basic,
            "PointingPair" | "PointingTriple" | "NakedPair" | "NakedTriple" | "HiddenPair"
            | "HiddenTriple" | "ClaimingCandidate" => TechniqueLevel::Intermediate,
            "X-Wing" | "Swordfish" | "XY-Wing" | "XYZ-Wing" | "Skyscraper" | "TwoStringKite" => {
                TechniqueLevel::Advanced
            }
            "Jellyfish" | "UniqueRectangleType1" | "W-Wing" => TechniqueLevel::Master,
            _ => TechniqueLevel::None,
        };

        if level > stats.max_level {
            stats.max_level = level;
        }

        match level {
            TechniqueLevel::Intermediate => stats.intermediate_count += 1,
            TechniqueLevel::Advanced => stats.advanced_count += 1,
            TechniqueLevel::Master => stats.master_count += 1,
            _ => {}
        }
    }

    stats
}
