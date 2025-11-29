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

use crate::board::Board;
use crate::types::{CauseCell, Elimination, Placement, SolvingStep};
use std::collections::HashSet;

/// Bitmask representing all candidates (1-9) for a cell.
const ALL_CANDIDATES: u16 = 0b111111111;

// Pre-calculate and cache indices for all rows, columns, boxes, and peer cells.
// This avoids repeated calculations in hot loops within the solver.
lazy_static::lazy_static! {
    static ref ROW_UNITS: [[usize; 9]; 9] = {
        let mut units = [[0; 9]; 9];
        for (i, row) in units.iter_mut().enumerate() {
            for (j, cell) in row.iter_mut().enumerate() {
                *cell = i * 9 + j;
            }
        }
        units
    };
    static ref COL_UNITS: [[usize; 9]; 9] = {
        let mut units = [[0; 9]; 9];
        for (i, row) in units.iter_mut().enumerate() {
            for (j, cell) in row.iter_mut().enumerate() {
                *cell = j * 9 + i;
            }
        }
        units
    };
    static ref BOX_UNITS: [[usize; 9]; 9] = {
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
    static ref ALL_UNITS: Vec<&'static [usize]> = {
        let mut units = Vec::with_capacity(27);
        units.extend(ROW_UNITS.iter().map(|u| &u[..]));
        units.extend(COL_UNITS.iter().map(|u| &u[..]));
        units.extend(BOX_UNITS.iter().map(|u| &u[..]));
        units
    };
    /// A map from a cell index to a vector of its 20 peers.
    static ref PEER_MAP: [Vec<usize>; 81] = {
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
    Advanced,     // X-Wing, Swordfish
}

/// Convert a bitmask of candidates into a `Vec` of numbers.
#[inline]
fn mask_to_vec(mask: u16) -> Vec<u8> {
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

        // Propagate constraints from existing numbers to establish the initial candidate state.
        for i in 0..81 {
            if logical_board.cells[i] != 0 {
                logical_board.eliminate_from_peers(i, logical_board.cells[i]);
            }
        }
        logical_board
    }

    /// Sets a cell value and eliminates that value from peers. Returns true if successful.
    fn set_cell(&mut self, index: usize, value: u8) -> bool {
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

    // --- Basic Techniques ---

    /// Searches for a cell with exactly one candidate.
    fn find_naked_single(&self) -> Option<SolvingStep> {
        for i in 0..81 {
            if self.cells[i] == 0 && self.candidates[i].count_ones() == 1 {
                let value = (self.candidates[i].trailing_zeros() + 1) as u8;
                let eliminations = self.collect_peer_eliminations(i, value);

                return Some(SolvingStep {
                    technique: "NakedSingle".to_string(),
                    placements: vec![Placement { index: i, value }],
                    eliminations,
                    cause: vec![],
                });
            }
        }
        None
    }

    /// Helper to collect eliminations for Naked/Hidden Singles from peers.
    #[inline]
    fn collect_peer_eliminations(&self, index: usize, value: u8) -> Vec<Elimination> {
        PEER_MAP[index]
            .iter()
            .filter(|&&peer_idx| {
                self.cells[peer_idx] == 0 && (self.candidates[peer_idx] & (1 << (value - 1))) != 0
            })
            .map(|&peer_idx| Elimination {
                index: peer_idx,
                value,
            })
            .collect()
    }

    /// Searches for a candidate that appears only once in a specific group (row/col/box).
    fn find_hidden_single_in_group(&self, group: &[usize]) -> Option<SolvingStep> {
        for num in 1..=9 {
            // Check if 'num' appears exactly once in this group
            if let Some(target_idx) = self.find_unique_position_in_group(group, num) {
                let mask = 1 << (num - 1);
                let mut eliminations = self.collect_peer_eliminations(target_idx, num);

                // Internal eliminations: remove other candidates from the target cell
                let other_cands = self.candidates[target_idx] & !mask;
                if other_cands != 0 {
                    for cand in mask_to_vec(other_cands) {
                        eliminations.push(Elimination {
                            index: target_idx,
                            value: cand,
                        });
                    }
                }

                return Some(SolvingStep {
                    technique: "HiddenSingle".to_string(),
                    placements: vec![Placement {
                        index: target_idx,
                        value: num,
                    }],
                    eliminations,
                    cause: vec![],
                });
            }
        }
        None
    }

    /// Helper to find the single index in a group where 'num' is a candidate.
    #[inline]
    fn find_unique_position_in_group(&self, group: &[usize], num: u8) -> Option<usize> {
        let mask = 1 << (num - 1);
        let mut count = 0;
        let mut target_idx = 0;

        for &idx in group {
            if self.cells[idx] == 0 && (self.candidates[idx] & mask) != 0 {
                count += 1;
                target_idx = idx;
                if count > 1 {
                    return None; // Optimization: exit early if not unique
                }
            }
        }

        if count == 1 { Some(target_idx) } else { None }
    }

    // --- Intermediate Techniques (Naked Subsets) ---

    fn find_naked_pair(&self) -> Option<SolvingStep> {
        for unit in ALL_UNITS.iter() {
            // Filter to cells with exactly 2 candidates
            let unit_slice = *unit;
            let potential_indices = self.filter_naked_subset_candidates(unit_slice, 2);

            if potential_indices.len() < 2 {
                continue;
            }

            // Check all pairs
            for i in 0..potential_indices.len() {
                for j in (i + 1)..potential_indices.len() {
                    if let Some(step) = self.check_naked_pair(
                        potential_indices[i],
                        potential_indices[j],
                        unit_slice,
                    ) {
                        return Some(step);
                    }
                }
            }
        }
        None
    }

    #[inline]
    fn filter_naked_subset_candidates(&self, unit: &[usize], size: usize) -> Vec<usize> {
        unit.iter()
            .filter(|&&i| {
                let c = self.candidates[i].count_ones() as usize;
                self.cells[i] == 0 && c >= 2 && c <= size
            })
            .cloned()
            .collect()
    }

    #[inline]
    fn check_naked_pair(&self, idx1: usize, idx2: usize, unit: &[usize]) -> Option<SolvingStep> {
        if self.candidates[idx1] == self.candidates[idx2] {
            let mask = self.candidates[idx1];
            if mask.count_ones() == 2 {
                return self.construct_naked_subset_step(&[idx1, idx2], mask, unit, "NakedPair");
            }
        }
        None
    }

    fn find_naked_triple(&self) -> Option<SolvingStep> {
        for unit in ALL_UNITS.iter() {
            let unit_slice = *unit;
            // Filter cells with 2 or 3 candidates
            let potential_indices = self.filter_naked_subset_candidates(unit_slice, 3);

            if potential_indices.len() < 3 {
                continue;
            }

            if let Some(step) = self.check_naked_triple_combinations(&potential_indices, unit_slice)
            {
                return Some(step);
            }
        }
        None
    }

    #[inline]
    fn check_naked_triple_combinations(
        &self,
        indices: &[usize],
        unit: &[usize],
    ) -> Option<SolvingStep> {
        let len = indices.len();
        for i in 0..len {
            for j in (i + 1)..len {
                for k in (j + 1)..len {
                    if let Some(step) =
                        self.check_naked_triple(indices[i], indices[j], indices[k], unit)
                    {
                        return Some(step);
                    }
                }
            }
        }
        None
    }

    #[inline]
    fn check_naked_triple(
        &self,
        idx1: usize,
        idx2: usize,
        idx3: usize,
        unit: &[usize],
    ) -> Option<SolvingStep> {
        let union_mask = self.candidates[idx1] | self.candidates[idx2] | self.candidates[idx3];

        if union_mask.count_ones() == 3 {
            return self.construct_naked_subset_step(
                &[idx1, idx2, idx3],
                union_mask,
                unit,
                "NakedTriple",
            );
        }
        None
    }

    fn construct_naked_subset_step(
        &self,
        indices: &[usize],
        mask: u16,
        unit: &[usize],
        technique: &str,
    ) -> Option<SolvingStep> {
        let mut eliminations = Vec::new();
        let cands = mask_to_vec(mask);

        for &idx in unit {
            if !indices.contains(&idx) && self.cells[idx] == 0 && (self.candidates[idx] & mask) != 0
            {
                for &val in &cands {
                    if (self.candidates[idx] & (1 << (val - 1))) != 0 {
                        eliminations.push(Elimination {
                            index: idx,
                            value: val,
                        });
                    }
                }
            }
        }

        if eliminations.is_empty() {
            return None;
        }

        Some(SolvingStep {
            technique: technique.to_string(),
            placements: vec![],
            eliminations,
            cause: indices
                .iter()
                .map(|&i| CauseCell {
                    index: i,
                    candidates: cands.clone(),
                })
                .collect(),
        })
    }

    // --- Intermediate Techniques (Hidden Subsets) ---

    /// Creates a map of where each candidate appears in a unit.
    /// Returns `[u16; 10]` where index `n` (1-9) is a bitmask of positions (0-8) in the unit.
    #[inline]
    fn get_candidate_positions_in_unit(&self, unit: &[usize]) -> [u16; 10] {
        let mut positions = [0u16; 10];
        for (pos, &idx) in unit.iter().enumerate() {
            if self.cells[idx] == 0 {
                let mut c = self.candidates[idx];
                while c > 0 {
                    let trailing = c.trailing_zeros(); // 0-8
                    let num = trailing + 1; // 1-9
                    positions[num as usize] |= 1 << pos;
                    c &= !(1 << trailing);
                }
            }
        }
        positions
    }

    #[inline]
    fn filter_hidden_subset_candidates(&self, pos_masks: &[u16; 10], size: usize) -> Vec<usize> {
        (1..=9)
            .filter(|&n| {
                let c = pos_masks[n].count_ones() as usize;
                c >= 2 && c <= size
            })
            .collect()
    }

    fn find_hidden_pair(&self) -> Option<SolvingStep> {
        for unit in ALL_UNITS.iter() {
            let unit_slice = *unit;
            let pos_masks = self.get_candidate_positions_in_unit(unit_slice);
            let candidates = self.filter_hidden_subset_candidates(&pos_masks, 2);

            if candidates.len() < 2 {
                continue;
            }

            for i in 0..candidates.len() {
                for j in (i + 1)..candidates.len() {
                    if let Some(step) =
                        self.check_hidden_pair(candidates[i], candidates[j], &pos_masks, unit_slice)
                    {
                        return Some(step);
                    }
                }
            }
        }
        None
    }

    #[inline]
    fn check_hidden_pair(
        &self,
        n1: usize,
        n2: usize,
        pos_masks: &[u16; 10],
        unit: &[usize],
    ) -> Option<SolvingStep> {
        if pos_masks[n1] == pos_masks[n2] && pos_masks[n1].count_ones() == 2 {
            let mask_in_unit = pos_masks[n1];
            let cell_indices = self.indices_from_unit_mask(unit, mask_in_unit);

            let keep_mask = (1 << (n1 - 1)) | (1 << (n2 - 1));
            return self.construct_hidden_subset_step(
                &cell_indices,
                keep_mask,
                &[n1 as u8, n2 as u8],
                "HiddenPair",
            );
        }
        None
    }

    fn find_hidden_triple(&self) -> Option<SolvingStep> {
        for unit in ALL_UNITS.iter() {
            let unit_slice = *unit;
            let pos_masks = self.get_candidate_positions_in_unit(unit_slice);
            let candidates = self.filter_hidden_subset_candidates(&pos_masks, 3);

            if candidates.len() < 3 {
                continue;
            }

            if let Some(step) =
                self.check_hidden_triple_combinations(&candidates, &pos_masks, unit_slice)
            {
                return Some(step);
            }
        }
        None
    }

    #[inline]
    fn check_hidden_triple_combinations(
        &self,
        candidates: &[usize],
        pos_masks: &[u16; 10],
        unit: &[usize],
    ) -> Option<SolvingStep> {
        let len = candidates.len();
        for i in 0..len {
            for j in (i + 1)..len {
                for k in (j + 1)..len {
                    if let Some(step) = self.check_hidden_triple(
                        candidates[i],
                        candidates[j],
                        candidates[k],
                        pos_masks,
                        unit,
                    ) {
                        return Some(step);
                    }
                }
            }
        }
        None
    }

    #[inline]
    fn check_hidden_triple(
        &self,
        n1: usize,
        n2: usize,
        n3: usize,
        pos_masks: &[u16; 10],
        unit: &[usize],
    ) -> Option<SolvingStep> {
        let combined_pos = pos_masks[n1] | pos_masks[n2] | pos_masks[n3];
        if combined_pos.count_ones() == 3 {
            let cell_indices = self.indices_from_unit_mask(unit, combined_pos);
            let keep_mask = (1 << (n1 - 1)) | (1 << (n2 - 1)) | (1 << (n3 - 1));

            return self.construct_hidden_subset_step(
                &cell_indices,
                keep_mask,
                &[n1 as u8, n2 as u8, n3 as u8],
                "HiddenTriple",
            );
        }
        None
    }

    #[inline]
    fn indices_from_unit_mask(&self, unit: &[usize], mask: u16) -> Vec<usize> {
        let mut indices = Vec::with_capacity(mask.count_ones() as usize);
        for (i, &cell_idx) in unit.iter().enumerate() {
            if (mask & (1 << i)) != 0 {
                indices.push(cell_idx);
            }
        }
        indices
    }

    fn construct_hidden_subset_step(
        &self,
        indices: &[usize],
        keep_mask: u16,
        subset_nums: &[u8],
        technique: &str,
    ) -> Option<SolvingStep> {
        let mut eliminations = Vec::new();
        for &idx in indices {
            let other = self.candidates[idx] & !keep_mask;
            if other != 0 {
                for cand in mask_to_vec(other) {
                    eliminations.push(Elimination {
                        index: idx,
                        value: cand,
                    });
                }
            }
        }

        if eliminations.is_empty() {
            return None;
        }

        Some(SolvingStep {
            technique: technique.to_string(),
            placements: vec![],
            eliminations,
            cause: indices
                .iter()
                .map(|&idx| CauseCell {
                    index: idx,
                    candidates: subset_nums.to_vec(),
                })
                .collect(),
        })
    }

    /// Searches for Pointing Pairs/Triples.
    /// A candidate in a box is confined to a single row or column -> eliminates from rest of row/col.
    fn find_pointing_subset(&self) -> Option<SolvingStep> {
        for (box_idx, box_unit) in BOX_UNITS.iter().enumerate() {
            for num in 1..=9 {
                // Gather all cells in this box that have candidate 'num'
                let mask = 1 << (num - 1);
                let cells: Vec<usize> = box_unit
                    .iter()
                    .filter(|&&i| self.cells[i] == 0 && (self.candidates[i] & mask) != 0)
                    .cloned()
                    .collect();

                if cells.len() < 2 || cells.len() > 3 {
                    continue;
                }

                // Check alignment
                if let Some(step) = self.check_pointing_alignment(&cells, box_idx, num) {
                    return Some(step);
                }
            }
        }
        None
    }

    /// Checks if cells align in Row or Column and generates Pointing step.
    #[inline]
    fn check_pointing_alignment(
        &self,
        cells: &[usize],
        box_idx: usize,
        num: u8,
    ) -> Option<SolvingStep> {
        let row0 = cells[0] / 9;
        let col0 = cells[0] % 9;
        let same_row = cells.iter().all(|&c| c / 9 == row0);
        let same_col = cells.iter().all(|&c| c % 9 == col0);
        let mask = 1 << (num - 1);

        if same_row {
            let elims = self.collect_pointing_elims(
                num,
                mask,
                |col| row0 * 9 + col, // Coordinate mapper for Row
                box_idx,
            );
            if !elims.is_empty() {
                return Some(self.build_pointing_step(cells, elims, num));
            }
        }

        if same_col {
            let elims = self.collect_pointing_elims(
                num,
                mask,
                |row| row * 9 + col0, // Coordinate mapper for Col
                box_idx,
            );
            if !elims.is_empty() {
                return Some(self.build_pointing_step(cells, elims, num));
            }
        }
        None
    }

    /// Generic helper to collect eliminations for Pointing pairs.
    /// Iterates 0..9 using a coordinate mapper (to traverse row or col).
    #[inline]
    fn collect_pointing_elims<F>(
        &self,
        num: u8,
        mask: u16,
        mapper: F,
        box_idx: usize,
    ) -> Vec<Elimination>
    where
        F: Fn(usize) -> usize,
    {
        let mut elims = Vec::new();
        for k in 0..9 {
            let idx = mapper(k);
            // Eliminate if cell is NOT in the source box
            if (idx / 27 != box_idx / 3 || (idx % 9) / 3 != box_idx % 3)
                && self.cells[idx] == 0
                && (self.candidates[idx] & mask) != 0
            {
                elims.push(Elimination {
                    index: idx,
                    value: num,
                });
            }
        }
        elims
    }

    #[inline]
    fn build_pointing_step(
        &self,
        cells: &[usize],
        elims: Vec<Elimination>,
        num: u8,
    ) -> SolvingStep {
        SolvingStep {
            technique: if cells.len() == 2 {
                "PointingPair".into()
            } else {
                "PointingTriple".into()
            },
            placements: vec![],
            eliminations: elims,
            cause: cells
                .iter()
                .map(|&i| CauseCell {
                    index: i,
                    candidates: vec![num],
                })
                .collect(),
        }
    }

    /// Searches for Claiming Candidates (Box-Line Reduction).
    /// A candidate in a row/col is confined to a single box -> eliminates from rest of box.
    fn find_claiming_candidates(&self) -> Option<SolvingStep> {
        // Check Rows
        for row in 0..9 {
            if let Some(step) = self.find_claiming_in_unit(row, true) {
                return Some(step);
            }
        }
        // Check Columns
        for col in 0..9 {
            if let Some(step) = self.find_claiming_in_unit(col, false) {
                return Some(step);
            }
        }
        None
    }

    /// Generic check for Claiming Candidates in a linear unit (row or col).
    #[inline]
    fn find_claiming_in_unit(&self, unit_idx: usize, is_row: bool) -> Option<SolvingStep> {
        let unit = if is_row {
            &ROW_UNITS[unit_idx]
        } else {
            &COL_UNITS[unit_idx]
        };

        for num in 1..=9 {
            let mask = 1 << (num - 1);
            let mut cells = Vec::new();
            let mut box_indices = HashSet::new();

            // Find all cells in this line with the candidate
            for &idx in unit.iter() {
                if self.cells[idx] == 0 && (self.candidates[idx] & mask) != 0 {
                    cells.push(idx);
                    box_indices.insert((idx / 9 / 3) * 3 + (idx % 9 / 3));
                }
            }

            // If all candidates are in exactly one box, we can eliminate
            if !cells.is_empty() && box_indices.len() == 1 {
                let box_idx = *box_indices.iter().next().unwrap();
                let elims = self.collect_claiming_elims(box_idx, unit_idx, is_row, num, mask);

                if !elims.is_empty() {
                    return Some(SolvingStep {
                        technique: "ClaimingCandidate".into(),
                        placements: vec![],
                        eliminations: elims,
                        cause: cells
                            .iter()
                            .map(|&i| CauseCell {
                                index: i,
                                candidates: vec![num],
                            })
                            .collect(),
                    });
                }
            }
        }
        None
    }

    /// Helper to collect eliminations for Claiming Candidates.
    #[inline]
    fn collect_claiming_elims(
        &self,
        box_idx: usize,
        source_line_idx: usize,
        is_row: bool,
        num: u8,
        mask: u16,
    ) -> Vec<Elimination> {
        let mut elims = Vec::new();
        for &idx in &BOX_UNITS[box_idx] {
            let line_match = if is_row {
                idx / 9 == source_line_idx
            } else {
                idx % 9 == source_line_idx
            };

            // Eliminate if cell is in the box but NOT in the source line
            if !line_match && self.cells[idx] == 0 && (self.candidates[idx] & mask) != 0 {
                elims.push(Elimination {
                    index: idx,
                    value: num,
                });
            }
        }
        elims
    }

    // --- Advanced Techniques (Optimized Bitwise Fish) ---

    fn find_fish_techniques(&self) -> Option<SolvingStep> {
        // Calculate masks once for all Fish.
        // Returns row_masks[num][row] and col_masks[num][col]
        let (row_masks, col_masks) = self.get_all_fish_masks();

        for num in 1..=9 {
            // X-Wing (Size 2)
            if let Some(step) = self.check_x_wing(num, &row_masks[num], true) {
                return Some(step);
            }
            if let Some(step) = self.check_x_wing(num, &col_masks[num], false) {
                return Some(step);
            }

            // Swordfish (Size 3)
            if let Some(step) = self.check_swordfish(num, &row_masks[num], true) {
                return Some(step);
            }
            if let Some(step) = self.check_swordfish(num, &col_masks[num], false) {
                return Some(step);
            }
        }
        None
    }

    /// Pre-calculates fish masks for all numbers at once in a single board pass.
    /// Returns ([num][row_idx] -> mask, [num][col_idx] -> mask)
    fn get_all_fish_masks(&self) -> ([[u16; 9]; 10], [[u16; 9]; 10]) {
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
                    // Add to row mask 'r' for number 'num'
                    row_masks[num][r] |= 1 << c;
                    // Add to col mask 'c' for number 'num'
                    col_masks[num][c] |= 1 << r;

                    val &= !(1 << trailing);
                }
            }
        }
        (row_masks, col_masks)
    }

    #[inline]
    fn check_x_wing(&self, num: usize, masks: &[u16; 9], is_row_base: bool) -> Option<SolvingStep> {
        let mut valid_indices: Vec<usize> = Vec::with_capacity(9);
        for (i, &m) in masks.iter().enumerate() {
            if m.count_ones() == 2 {
                valid_indices.push(i);
            }
        }

        if valid_indices.len() < 2 {
            return None;
        }

        for i in 0..valid_indices.len() {
            for j in (i + 1)..valid_indices.len() {
                let r1 = valid_indices[i];
                let r2 = valid_indices[j];

                // Strict X-Wing: masks must be identical
                if masks[r1] == masks[r2] {
                    let union_mask = masks[r1];
                    if let Some(step) = self.construct_fish_step(
                        num as u8,
                        &[r1, r2],
                        union_mask,
                        is_row_base,
                        "X-Wing",
                    ) {
                        return Some(step);
                    }
                }
            }
        }
        None
    }

    /// Iterates triples of valid indices to find a Swordfish match.
    #[inline]
    fn check_swordfish(
        &self,
        num: usize,
        masks: &[u16; 9],
        is_row_base: bool,
    ) -> Option<SolvingStep> {
        let mut valid_indices: Vec<usize> = Vec::with_capacity(9);
        for (i, &m) in masks.iter().enumerate() {
            let c = m.count_ones();
            if (2..=3).contains(&c) {
                valid_indices.push(i);
            }
        }

        if valid_indices.len() < 3 {
            return None;
        }

        if let Some(step) =
            self.check_swordfish_combinations(num as u8, &valid_indices, masks, is_row_base)
        {
            return Some(step);
        }
        None
    }

    #[inline]
    fn check_swordfish_combinations(
        &self,
        num: u8,
        indices: &[usize],
        masks: &[u16; 9],
        is_row_base: bool,
    ) -> Option<SolvingStep> {
        let len = indices.len();
        for i in 0..len {
            for j in (i + 1)..len {
                for k in (j + 1)..len {
                    let r1 = indices[i];
                    let r2 = indices[j];
                    let r3 = indices[k];
                    let union_mask = masks[r1] | masks[r2] | masks[r3];

                    if union_mask.count_ones() != 3 {
                        continue;
                    }

                    if let Some(step) = self.construct_fish_step(
                        num,
                        &[r1, r2, r3],
                        union_mask,
                        is_row_base,
                        "Swordfish",
                    ) {
                        return Some(step);
                    }
                }
            }
        }
        None
    }

    /// Constructs the step if eliminations are found.
    fn construct_fish_step(
        &self,
        num: u8,
        base_indices: &[usize],
        union_mask: u16,
        is_row_base: bool,
        tech_name: &str,
    ) -> Option<SolvingStep> {
        let cand_bit = 1 << (num - 1);
        let cover_indices: Vec<usize> = (0..9).filter(|&x| (union_mask & (1 << x)) != 0).collect();

        let cause_cells =
            self.collect_fish_causes(cand_bit, num, base_indices, &cover_indices, is_row_base);
        let eliminations = self.collect_fish_eliminations(
            cand_bit,
            num,
            base_indices,
            &cover_indices,
            is_row_base,
        );

        if eliminations.is_empty() {
            None
        } else {
            Some(SolvingStep {
                technique: tech_name.to_string(),
                placements: vec![],
                eliminations,
                cause: cause_cells,
            })
        }
    }

    /// Collects the cause cells for a Fish pattern.
    #[inline]
    fn collect_fish_causes(
        &self,
        cand_bit: u16,
        num: u8,
        base_indices: &[usize],
        cover_indices: &[usize],
        is_row_base: bool,
    ) -> Vec<CauseCell> {
        let mut cause_cells = Vec::new();
        for &base_idx in base_indices {
            for &cover_idx in cover_indices {
                let cell_idx = if is_row_base {
                    base_idx * 9 + cover_idx
                } else {
                    cover_idx * 9 + base_idx
                };

                if self.cells[cell_idx] == 0 && (self.candidates[cell_idx] & cand_bit) != 0 {
                    cause_cells.push(CauseCell {
                        index: cell_idx,
                        candidates: vec![num],
                    });
                }
            }
        }
        cause_cells
    }

    /// Collects eliminations for a Fish pattern.
    #[inline]
    fn collect_fish_eliminations(
        &self,
        cand_bit: u16,
        num: u8,
        base_indices: &[usize],
        cover_indices: &[usize],
        is_row_base: bool,
    ) -> Vec<Elimination> {
        let mut eliminations = Vec::new();
        for &cover_idx in cover_indices {
            for orthogonal_idx in 0..9 {
                // Skip if this row/col is part of the base set
                if base_indices.contains(&orthogonal_idx) {
                    continue;
                }

                let cell_idx = if is_row_base {
                    orthogonal_idx * 9 + cover_idx // iterate rows in this col
                } else {
                    cover_idx * 9 + orthogonal_idx // iterate cols in this row
                };

                if self.cells[cell_idx] == 0 && (self.candidates[cell_idx] & cand_bit) != 0 {
                    eliminations.push(Elimination {
                        index: cell_idx,
                        value: num,
                    });
                }
            }
        }
        eliminations
    }
}

/// Solve the board by repeatedly applying logical techniques and return the steps.
pub fn solve_with_steps(initial_board: &Board) -> (Vec<SolvingStep>, Board) {
    let mut board = LogicalBoard::from_board(initial_board);
    let mut steps = Vec::new();

    loop {
        // Try techniques in order of complexity/speed
        let progress = try_naked_single(&mut board, &mut steps)
            || try_hidden_single(&mut board, &mut steps)
            || try_naked_pair(&mut board, &mut steps)
            || try_naked_triple(&mut board, &mut steps)
            || try_pointing_subset(&mut board, &mut steps)
            || try_hidden_pair(&mut board, &mut steps)
            || try_hidden_triple(&mut board, &mut steps)
            || try_claiming_candidate(&mut board, &mut steps)
            // Advanced Techniques (Optimized - Single Pass)
            || try_fish_techniques(&mut board, &mut steps);

        if !progress {
            break;
        }
    }

    (steps, Board { cells: board.cells })
}

fn try_naked_single(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    if let Some(step) = board.find_naked_single() {
        board.set_cell(step.placements[0].index, step.placements[0].value);
        steps.push(step);
        return true;
    }
    false
}

fn try_hidden_single(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    // Explicitly typed variables allow Rust to invoke Deref coercion from the lazy_static wrapper
    // to the underlying array type.
    let all_units: &[&[usize]] = &ALL_UNITS;
    for unit in all_units.iter() {
        if let Some(step) = board.find_hidden_single_in_group(unit) {
            board.set_cell(step.placements[0].index, step.placements[0].value);
            steps.push(step);
            return true;
        }
    }
    false
}

fn try_naked_pair(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    if let Some(step) = board.find_naked_pair() {
        for elim in &step.eliminations {
            board.candidates[elim.index] &= !(1 << (elim.value - 1));
        }
        steps.push(step);
        return true;
    }
    false
}

fn try_naked_triple(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    if let Some(step) = board.find_naked_triple() {
        for elim in &step.eliminations {
            board.candidates[elim.index] &= !(1 << (elim.value - 1));
        }
        steps.push(step);
        return true;
    }
    false
}

fn try_pointing_subset(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    if let Some(step) = board.find_pointing_subset() {
        for elim in &step.eliminations {
            board.candidates[elim.index] &= !(1 << (elim.value - 1));
        }
        steps.push(step);
        return true;
    }
    false
}

fn try_hidden_pair(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    if let Some(step) = board.find_hidden_pair() {
        for elim in &step.eliminations {
            board.candidates[elim.index] &= !(1 << (elim.value - 1));
        }
        steps.push(step);
        return true;
    }
    false
}

fn try_hidden_triple(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    if let Some(step) = board.find_hidden_triple() {
        for elim in &step.eliminations {
            board.candidates[elim.index] &= !(1 << (elim.value - 1));
        }
        steps.push(step);
        return true;
    }
    false
}

fn try_claiming_candidate(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    if let Some(step) = board.find_claiming_candidates() {
        for elim in &step.eliminations {
            board.candidates[elim.index] &= !(1 << (elim.value - 1));
        }
        steps.push(step);
        return true;
    }
    false
}

fn try_fish_techniques(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    if let Some(step) = board.find_fish_techniques() {
        for elim in &step.eliminations {
            board.candidates[elim.index] &= !(1 << (elim.value - 1));
        }
        steps.push(step);
        return true;
    }
    false
}

/// Determines the logical difficulty of solving a board by finding the hardest
/// technique required to make any progress.
pub fn get_difficulty(initial_board: &Board) -> (TechniqueLevel, Board) {
    let (steps, final_board) = solve_with_steps(initial_board);

    let max_level = steps
        .iter()
        .map(|step| match step.technique.as_str() {
            "NakedSingle" | "HiddenSingle" => TechniqueLevel::Basic,
            "PointingPair" | "PointingTriple" | "NakedPair" | "NakedTriple" | "HiddenPair"
            | "HiddenTriple" | "ClaimingCandidate" => TechniqueLevel::Intermediate,
            "X-Wing" | "Swordfish" => TechniqueLevel::Advanced,
            _ => TechniqueLevel::None,
        })
        .max()
        .unwrap_or(TechniqueLevel::None);

    (max_level, final_board)
}
