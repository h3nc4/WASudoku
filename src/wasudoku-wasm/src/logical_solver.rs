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

struct FishSearchContext<'a> {
    num: u8,
    valid_indices: &'a [usize],
    masks: &'a [u16; 9],
    size: usize,
    is_row_base: bool,
    tech_name: &'a str,
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
            if let Some(step) = self.check_fish(num, &row_masks[num], 2, true, "X-Wing") {
                return Some(step);
            }
            if let Some(step) = self.check_fish(num, &col_masks[num], 2, false, "X-Wing") {
                return Some(step);
            }

            // Swordfish (Size 3)
            if let Some(step) = self.check_fish(num, &row_masks[num], 3, true, "Swordfish") {
                return Some(step);
            }
            if let Some(step) = self.check_fish(num, &col_masks[num], 3, false, "Swordfish") {
                return Some(step);
            }

            // Jellyfish (Size 4) - Master Level
            if let Some(step) = self.check_fish(num, &row_masks[num], 4, true, "Jellyfish") {
                return Some(step);
            }
            if let Some(step) = self.check_fish(num, &col_masks[num], 4, false, "Jellyfish") {
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

    /// Generalized Fish Finder (X-Wing, Swordfish, Jellyfish)
    fn check_fish(
        &self,
        num: usize,
        masks: &[u16; 9],
        size: usize,
        is_row_base: bool,
        tech_name: &str,
    ) -> Option<SolvingStep> {
        // Filter rows/cols that have 2..size occurrences of the candidate
        let valid_indices: Vec<usize> = masks
            .iter()
            .enumerate()
            .filter(|&(_, m)| {
                let c = m.count_ones() as usize;
                c >= 2 && c <= size
            })
            .map(|(i, _)| i)
            .collect();

        if valid_indices.len() < size {
            return None;
        }

        let ctx = FishSearchContext {
            num: num as u8,
            valid_indices: &valid_indices,
            masks,
            size,
            is_row_base,
            tech_name,
        };

        // Generate combinations of 'size' indices
        // Simple recursion to iterate combinations
        self.find_fish_combo(&ctx, 0, &mut Vec::with_capacity(size))
    }

    fn find_fish_combo(
        &self,
        ctx: &FishSearchContext,
        start: usize,
        combo: &mut Vec<usize>,
    ) -> Option<SolvingStep> {
        if combo.len() == ctx.size {
            // Check if union of masks has <= size bits set
            let mut union_mask = 0;
            for &idx in combo.iter() {
                union_mask |= ctx.masks[idx];
            }

            if union_mask.count_ones() as usize <= ctx.size {
                // Strictly speaking, fish requires N lines covered by N columns/rows.
                // count_ones == size usually implies exact match. < size is degenerate fish but valid.
                return self.construct_fish_step(
                    ctx.num,
                    combo,
                    union_mask,
                    ctx.is_row_base,
                    ctx.tech_name,
                );
            }
            return None;
        }

        for i in start..ctx.valid_indices.len() {
            combo.push(ctx.valid_indices[i]);
            if let Some(step) = self.find_fish_combo(ctx, i + 1, combo) {
                return Some(step);
            }
            combo.pop();
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

    // --- Advanced Techniques: Wings and Chains ---

    /// Searches for XY-Wings.
    fn find_xy_wing(&self) -> Option<SolvingStep> {
        // Collect bi-value cells
        let bivalue_cells: Vec<usize> = (0..81)
            .filter(|&i| self.cells[i] == 0 && self.candidates[i].count_ones() == 2)
            .collect();

        if bivalue_cells.len() < 3 {
            return None;
        }

        for &pivot_idx in &bivalue_cells {
            if let Some(step) = self.find_xy_wing_for_pivot(pivot_idx) {
                return Some(step);
            }
        }
        None
    }

    fn find_xy_wing_for_pivot(&self, pivot_idx: usize) -> Option<SolvingStep> {
        let pivot_cands = mask_to_vec(self.candidates[pivot_idx]);
        let a = pivot_cands[0];
        let b = pivot_cands[1];

        // Find peers of pivot that are also bi-value
        let peer_bivalues: Vec<usize> = PEER_MAP[pivot_idx]
            .iter()
            .cloned()
            .filter(|&idx| {
                self.cells[idx] == 0
                    && self.candidates[idx].count_ones() == 2
                    && (self.candidates[idx] & self.candidates[pivot_idx]) != 0
            })
            .collect();

        for &p1_idx in &peer_bivalues {
            if let Some(step) = self.check_xy_wing_pincers(pivot_idx, p1_idx, &peer_bivalues, a, b)
            {
                return Some(step);
            }
        }
        None
    }

    fn check_xy_wing_pincers(
        &self,
        pivot_idx: usize,
        p1_idx: usize,
        peers: &[usize],
        a: u8,
        b: u8,
    ) -> Option<SolvingStep> {
        let p1_cands = self.candidates[p1_idx];
        let share_a = (p1_cands & (1 << (a - 1))) != 0;
        let share_b = (p1_cands & (1 << (b - 1))) != 0;

        // Only strictly one shared value for a valid XY-Wing connection from this pivot side
        if share_a == share_b {
            return None;
        }

        let c_val = if share_a {
            // Pincer1 is (A, C). Find C.
            (p1_cands & !(1 << (a - 1))).trailing_zeros() + 1
        } else {
            // Pincer1 is (B, C).
            (p1_cands & !(1 << (b - 1))).trailing_zeros() + 1
        } as u8;

        // We need Pincer2. It must share the OTHER pivot value.
        let other_pivot_val = if share_a { b } else { a };
        let target_mask = (1 << (other_pivot_val - 1)) | (1 << (c_val - 1));

        for &p2_idx in peers {
            if p1_idx == p2_idx {
                continue;
            }
            if self.candidates[p2_idx] == target_mask {
                // Found a potential XY-Wing. Eliminate C from cells seen by BOTH P1 and P2
                let elims = self.find_xy_wing_eliminations(p1_idx, p2_idx, pivot_idx, c_val);

                if !elims.is_empty() {
                    return Some(SolvingStep {
                        technique: "XY-Wing".to_string(),
                        placements: vec![],
                        eliminations: elims,
                        cause: vec![
                            CauseCell {
                                index: pivot_idx,
                                candidates: vec![a, b],
                            },
                            CauseCell {
                                index: p1_idx,
                                candidates: mask_to_vec(self.candidates[p1_idx]),
                            },
                            CauseCell {
                                index: p2_idx,
                                candidates: mask_to_vec(self.candidates[p2_idx]),
                            },
                        ],
                    });
                }
            }
        }
        None
    }

    fn find_xy_wing_eliminations(
        &self,
        p1_idx: usize,
        p2_idx: usize,
        pivot_idx: usize,
        c_val: u8,
    ) -> Vec<Elimination> {
        let mut elims = Vec::new();
        let c_mask = 1 << (c_val - 1);

        for &target_idx in &PEER_MAP[p1_idx] {
            if target_idx != pivot_idx
                && target_idx != p2_idx
                && self.cells[target_idx] == 0
                && (self.candidates[target_idx] & c_mask) != 0
                && PEER_MAP[p2_idx].contains(&target_idx)
            {
                elims.push(Elimination {
                    index: target_idx,
                    value: c_val,
                });
            }
        }
        elims
    }

    /// Searches for XYZ-Wings.
    fn find_xyz_wing(&self) -> Option<SolvingStep> {
        // Pivot must have 3 candidates
        let trivalue_cells: Vec<usize> = (0..81)
            .filter(|&i| self.cells[i] == 0 && self.candidates[i].count_ones() == 3)
            .collect();

        for &pivot_idx in &trivalue_cells {
            if let Some(step) = self.find_xyz_wing_for_pivot(pivot_idx) {
                return Some(step);
            }
        }
        None
    }

    fn find_xyz_wing_for_pivot(&self, pivot_idx: usize) -> Option<SolvingStep> {
        let pivot_mask = self.candidates[pivot_idx];

        // Find potential pincers: bivalue cells that are subsets of the pivot
        let potential_pincers: Vec<usize> = PEER_MAP[pivot_idx]
            .iter()
            .cloned()
            .filter(|&idx| {
                self.cells[idx] == 0
                    && self.candidates[idx].count_ones() == 2
                    && (self.candidates[idx] & !pivot_mask) == 0
            })
            .collect();

        if potential_pincers.len() < 2 {
            return None;
        }

        for i in 0..potential_pincers.len() {
            for j in (i + 1)..potential_pincers.len() {
                if let Some(step) = self.check_xyz_wing_pincers(
                    pivot_idx,
                    potential_pincers[i],
                    potential_pincers[j],
                    pivot_mask,
                ) {
                    return Some(step);
                }
            }
        }
        None
    }

    fn check_xyz_wing_pincers(
        &self,
        pivot: usize,
        p1: usize,
        p2: usize,
        pivot_mask: u16,
    ) -> Option<SolvingStep> {
        let m1 = self.candidates[p1];
        let m2 = self.candidates[p2];

        // Must have common candidate Z in ALL THREE cells
        let common_mask = pivot_mask & m1 & m2;
        if common_mask.count_ones() != 1 {
            return None;
        }

        // Union(P1, P2) must equal Pivot
        if (m1 | m2) != pivot_mask {
            return None;
        }

        let elim_val = (common_mask.trailing_zeros() + 1) as u8;
        let elim_bit = common_mask;

        // Find eliminations: cells that see Pivot AND P1 AND P2
        let mut elims = Vec::new();

        for &target_idx in &PEER_MAP[pivot] {
            if target_idx != p1
                && target_idx != p2
                && self.cells[target_idx] == 0
                && (self.candidates[target_idx] & elim_bit) != 0
                && PEER_MAP[p1].contains(&target_idx)
                && PEER_MAP[p2].contains(&target_idx)
            {
                elims.push(Elimination {
                    index: target_idx,
                    value: elim_val,
                });
            }
        }

        if !elims.is_empty() {
            return Some(SolvingStep {
                technique: "XYZ-Wing".to_string(),
                placements: vec![],
                eliminations: elims,
                cause: vec![
                    CauseCell {
                        index: pivot,
                        candidates: mask_to_vec(pivot_mask),
                    },
                    CauseCell {
                        index: p1,
                        candidates: mask_to_vec(m1),
                    },
                    CauseCell {
                        index: p2,
                        candidates: mask_to_vec(m2),
                    },
                ],
            });
        }
        None
    }

    /// Searches for Skyscraper pattern.
    fn find_skyscraper(&self) -> Option<SolvingStep> {
        let (row_masks, col_masks) = self.get_all_fish_masks();

        for num in 1..=9 {
            // Check Rows base
            if let Some(step) = self.check_skyscraper(num, &row_masks[num], true) {
                return Some(step);
            }
            // Check Cols base
            if let Some(step) = self.check_skyscraper(num, &col_masks[num], false) {
                return Some(step);
            }
        }
        None
    }

    #[inline]
    fn check_skyscraper(
        &self,
        num: usize,
        masks: &[u16; 9],
        is_row_base: bool,
    ) -> Option<SolvingStep> {
        // Find indices of rows/cols with exactly 2 candidates
        let valid_indices: Vec<usize> = masks
            .iter()
            .enumerate()
            .filter(|&(_, m)| m.count_ones() == 2)
            .map(|(i, _)| i)
            .collect();

        if valid_indices.len() < 2 {
            return None;
        }

        for i in 0..valid_indices.len() {
            for j in (i + 1)..valid_indices.len() {
                if let Some(step) = self.check_skyscraper_pair(
                    num,
                    masks,
                    is_row_base,
                    valid_indices[i],
                    valid_indices[j],
                ) {
                    return Some(step);
                }
            }
        }
        None
    }

    fn check_skyscraper_pair(
        &self,
        num: usize,
        masks: &[u16; 9],
        is_row_base: bool,
        r1: usize,
        r2: usize,
    ) -> Option<SolvingStep> {
        let m1 = masks[r1];
        let m2 = masks[r2];

        // Check alignment: Do they share exactly ONE common column bit?
        let common = m1 & m2;
        if common.count_ones() != 1 {
            return None;
        }

        // The "roof" tips are the non-common bits.
        let roof_mask = (m1 ^ m2) & !common;
        if roof_mask.count_ones() != 2 {
            return None;
        }

        // Get coordinates of the roof cells
        let c1_idx = (m1 & !common).trailing_zeros() as usize;
        let c2_idx = (m2 & !common).trailing_zeros() as usize;

        let roof_cell_1 = if is_row_base {
            r1 * 9 + c1_idx
        } else {
            c1_idx * 9 + r1
        };
        let roof_cell_2 = if is_row_base {
            r2 * 9 + c2_idx
        } else {
            c2_idx * 9 + r2
        };

        // Also store the base cells for highlighting
        let base_col = common.trailing_zeros() as usize;
        let base_cell_1 = if is_row_base {
            r1 * 9 + base_col
        } else {
            base_col * 9 + r1
        };
        let base_cell_2 = if is_row_base {
            r2 * 9 + base_col
        } else {
            base_col * 9 + r2
        };

        // Eliminate num from intersection of roof cells
        let mut elims = Vec::new();
        let cand_bit = 1 << (num - 1);

        for &target_idx in &PEER_MAP[roof_cell_1] {
            if self.cells[target_idx] == 0
                && (self.candidates[target_idx] & cand_bit) != 0
                && PEER_MAP[roof_cell_2].contains(&target_idx)
            {
                elims.push(Elimination {
                    index: target_idx,
                    value: num as u8,
                });
            }
        }

        if !elims.is_empty() {
            return Some(SolvingStep {
                technique: "Skyscraper".to_string(),
                placements: vec![],
                eliminations: elims,
                cause: vec![
                    CauseCell {
                        index: roof_cell_1,
                        candidates: vec![num as u8],
                    },
                    CauseCell {
                        index: roof_cell_2,
                        candidates: vec![num as u8],
                    },
                    CauseCell {
                        index: base_cell_1,
                        candidates: vec![num as u8],
                    },
                    CauseCell {
                        index: base_cell_2,
                        candidates: vec![num as u8],
                    },
                ],
            });
        }
        None
    }

    /// Searches for Two-String Kite.
    fn find_two_string_kite(&self) -> Option<SolvingStep> {
        let (row_masks, col_masks) = self.get_all_fish_masks();

        for num in 1..=9 {
            if let Some(step) = self.check_two_string_kite_for_num(num, &row_masks, &col_masks) {
                return Some(step);
            }
        }
        None
    }

    fn check_two_string_kite_for_num(
        &self,
        num: usize,
        row_masks: &[[u16; 9]; 10],
        col_masks: &[[u16; 9]; 10],
    ) -> Option<SolvingStep> {
        let rows_2: Vec<usize> = row_masks[num]
            .iter()
            .enumerate()
            .filter(|&(_, m)| m.count_ones() == 2)
            .map(|(i, _)| i)
            .collect();
        let cols_2: Vec<usize> = col_masks[num]
            .iter()
            .enumerate()
            .filter(|&(_, m)| m.count_ones() == 2)
            .map(|(i, _)| i)
            .collect();

        for &r in &rows_2 {
            for &c in &cols_2 {
                if let Some(step) =
                    self.check_kite_intersection(num, r, c, row_masks[num][r], col_masks[num][c])
                {
                    return Some(step);
                }
            }
        }
        None
    }

    fn check_kite_intersection(
        &self,
        num: usize,
        r: usize,
        c: usize,
        r_mask: u16,
        c_mask: u16,
    ) -> Option<SolvingStep> {
        let r_cols = mask_to_vec(r_mask);
        let c_rows = mask_to_vec(c_mask);

        let cell_r1 = r * 9 + (r_cols[0] as usize - 1);
        let cell_r2 = r * 9 + (r_cols[1] as usize - 1);

        let cell_c1 = (c_rows[0] as usize - 1) * 9 + c;
        let cell_c2 = (c_rows[1] as usize - 1) * 9 + c;

        self.find_kite_connection(num, [cell_r1, cell_r2], [cell_c1, cell_c2])
    }

    fn find_kite_connection(
        &self,
        num: usize,
        row_cells: [usize; 2],
        col_cells: [usize; 2],
    ) -> Option<SolvingStep> {
        for &rc in &row_cells {
            for &cc in &col_cells {
                if let Some(step) = self.check_kite_pair(num, rc, cc, row_cells, col_cells) {
                    return Some(step);
                }
            }
        }
        None
    }

    fn check_kite_pair(
        &self,
        num: usize,
        rc: usize,
        cc: usize,
        row_cells: [usize; 2],
        col_cells: [usize; 2],
    ) -> Option<SolvingStep> {
        if rc == cc {
            return None;
        }

        // Helper to get box index
        let get_box = |idx: usize| (idx / 9 / 3) * 3 + (idx % 9 / 3);

        if get_box(rc) == get_box(cc) {
            let other_rc = if rc == row_cells[0] {
                row_cells[1]
            } else {
                row_cells[0]
            };
            let other_cc = if cc == col_cells[0] {
                col_cells[1]
            } else {
                col_cells[0]
            };
            return self.construct_kite_step(num, rc, cc, other_rc, other_cc);
        }
        None
    }

    fn construct_kite_step(
        &self,
        num: usize,
        rc: usize,
        cc: usize,
        other_rc: usize,
        other_cc: usize,
    ) -> Option<SolvingStep> {
        // Eliminate from intersection of other_rc and other_cc
        let mut elims = Vec::new();
        let cand_bit = 1 << (num - 1);

        for &target_idx in &PEER_MAP[other_rc] {
            if self.cells[target_idx] == 0
                && (self.candidates[target_idx] & cand_bit) != 0
                && PEER_MAP[other_cc].contains(&target_idx)
            {
                elims.push(Elimination {
                    index: target_idx,
                    value: num as u8,
                });
            }
        }

        if !elims.is_empty() {
            return Some(SolvingStep {
                technique: "TwoStringKite".to_string(),
                placements: vec![],
                eliminations: elims,
                cause: vec![
                    CauseCell {
                        index: rc,
                        candidates: vec![num as u8],
                    },
                    CauseCell {
                        index: cc,
                        candidates: vec![num as u8],
                    },
                    CauseCell {
                        index: other_rc,
                        candidates: vec![num as u8],
                    },
                    CauseCell {
                        index: other_cc,
                        candidates: vec![num as u8],
                    },
                ],
            });
        }
        None
    }

    // --- Master Techniques ---

    /// Searches for Unique Rectangle Type 1.
    /// Looks for a "deadly pattern" of candidates {x, y} in 4 cells forming a rectangle in 2 boxes.
    /// If 3 cells have exactly {x, y} and the 4th has {x, y, ...}, we eliminate x and y from the 4th.
    fn find_unique_rectangle_type_1(&self) -> Option<SolvingStep> {
        // We iterate over all pairs of rows
        for r1 in 0..9 {
            for r2 in (r1 + 1)..9 {
                // If rows span more than 2 boxes (e.g. row 0 and row 8), they are far apart, but UR can exist anywhere.
                // However, standard UR definition requires the rectangle to be in exactly 2 blocks.
                // Rows 0 and 1 are in same block set. Rows 0 and 3 are different block sets.
                // Condition: (r1/3) == (r2/3) implies same block row.
                // Actually, simple condition: The two cells in r1 must share a box, and the two in r2 must share a box.
                // Since they share columns, they will naturally be in same boxes vertically if c1, c2 share a box.
                // So we just iterate col pairs.

                for c1 in 0..9 {
                    for c2 in (c1 + 1)..9 {
                        // Check box constraint: (r1,c1) and (r2,c1) must be in same box? NO.
                        // UR pattern:
                        // A(r1,c1)  B(r1,c2)
                        // C(r2,c1)  D(r2,c2)
                        // A and C must be in the same box? No.
                        // A and B must be in same box. C and D must be in same box.
                        // AND A and C are in same column. B and D are in same column.
                        // So: box(A) == box(B) AND box(C) == box(D).
                        // Also, box(A) != box(C) is implicitly true if we want them to span 2 boxes.

                        let idx_tl = r1 * 9 + c1;
                        let idx_tr = r1 * 9 + c2;
                        let idx_bl = r2 * 9 + c1;
                        let idx_br = r2 * 9 + c2;

                        // Check blocks
                        if (idx_tl / 27) != (idx_tr / 27)
                            || (idx_tl % 9) / 3 != (idx_tr % 9) / 3
                            || (idx_bl / 27) != (idx_br / 27)
                            || (idx_bl % 9) / 3 != (idx_br % 9) / 3
                        {
                            continue;
                        }

                        // Check empty cells
                        if self.cells[idx_tl] != 0
                            || self.cells[idx_tr] != 0
                            || self.cells[idx_bl] != 0
                            || self.cells[idx_br] != 0
                        {
                            continue;
                        }

                        // Collect candidates
                        let mask_tl = self.candidates[idx_tl];
                        let mask_tr = self.candidates[idx_tr];
                        let mask_bl = self.candidates[idx_bl];
                        let mask_br = self.candidates[idx_br];

                        // Find common pair mask
                        // We look for a pair mask P such that 3 cells == P, and 1 cell has P as subset.
                        // Or more generically for Type 1: 3 cells are bivalue with same candidates.
                        let corners = [
                            (idx_tl, mask_tl),
                            (idx_tr, mask_tr),
                            (idx_bl, mask_bl),
                            (idx_br, mask_br),
                        ];
                        let mut bivalue_masks = Vec::new();

                        for &(_, m) in &corners {
                            if m.count_ones() == 2 {
                                bivalue_masks.push(m);
                            }
                        }

                        if bivalue_masks.len() < 3 {
                            continue;
                        }

                        // Check if at least 3 have the SAME mask
                        // Since mask count is 2, just direct equality check
                        // We can just iterate the corners again to find the "odd one out"
                        for i in 0..4 {
                            let (target_idx, target_mask) = corners[i];
                            let others: Vec<u16> = corners
                                .iter()
                                .enumerate()
                                .filter(|&(idx, _)| idx != i)
                                .map(|(_, &(_, m))| m)
                                .collect();

                            let common_mask = others[0];
                            if common_mask.count_ones() == 2
                                && others[1] == common_mask
                                && others[2] == common_mask
                            {
                                // Found 3 cells with identical bivalue mask.
                                // The target cell must contain this mask as subset to be a deadly pattern source.
                                if (target_mask & common_mask) == common_mask
                                    && target_mask != common_mask
                                {
                                    // Eliminate the common candidates from the target cell
                                    let elim_vals = mask_to_vec(common_mask);
                                    let eliminations: Vec<Elimination> = elim_vals
                                        .iter()
                                        .map(|&val| Elimination {
                                            index: target_idx,
                                            value: val,
                                        })
                                        .collect();

                                    let cause: Vec<CauseCell> = corners
                                        .iter()
                                        .enumerate()
                                        .filter(|&(idx, _)| idx != i)
                                        .map(|(_, &(idx, _))| CauseCell {
                                            index: idx,
                                            candidates: elim_vals.clone(),
                                        })
                                        .collect();

                                    return Some(SolvingStep {
                                        technique: "UniqueRectangleType1".to_string(),
                                        placements: vec![],
                                        eliminations,
                                        cause,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        None
    }

    /// Searches for W-Wing.
    /// Pattern: Two cells [AB] (same bivalue candidates) that do not share a unit.
    /// Connected by a Strong Link on B.
    /// Eliminate A from any cell seeing both [AB] cells.
    fn find_w_wing(&self) -> Option<SolvingStep> {
        // 1. Find all bivalue cells
        let bivalue_cells: Vec<(usize, u16)> = (0..81)
            .filter(|&i| self.cells[i] == 0 && self.candidates[i].count_ones() == 2)
            .map(|i| (i, self.candidates[i]))
            .collect();

        // 2. Iterate pairs of bivalue cells with SAME candidates
        for i in 0..bivalue_cells.len() {
            for j in (i + 1)..bivalue_cells.len() {
                let (idx1, mask1) = bivalue_cells[i];
                let (idx2, mask2) = bivalue_cells[j];

                if mask1 != mask2 {
                    continue;
                }

                // They must NOT share a unit (row, col, box) - otherwise it's a Naked Pair
                if PEER_MAP[idx1].contains(&idx2) {
                    continue;
                }

                let cands = mask_to_vec(mask1);
                let a = cands[0];
                let b = cands[1];

                // Check for strong link on A -> Eliminate B
                if let Some(step) = self.check_w_wing_link(idx1, idx2, a, b) {
                    return Some(step);
                }
                // Check for strong link on B -> Eliminate A
                if let Some(step) = self.check_w_wing_link(idx1, idx2, b, a) {
                    return Some(step);
                }
            }
        }
        None
    }

    // Checks for a strong link on `link_val` connecting `idx1` and `idx2`.
    // If found, eliminates `elim_val`.
    fn check_w_wing_link(
        &self,
        idx1: usize,
        idx2: usize,
        link_val: u8,
        elim_val: u8,
    ) -> Option<SolvingStep> {
        // A strong link is a unit where `link_val` appears exactly twice.
        // One appearance must be seen by idx1, the other by idx2.
        // Wait, W-Wing usually implies the strong link *endpoints* are seen by the bivalue cells?
        // Standard W-Wing: [AB] --(A)-- [A] ==strong== [A] --(A)-- [AB].
        // So we need to find a conjugate pair of `link_val` somewhere in the grid.
        // One end of the conjugate pair must see `idx1`. The other must see `idx2`.

        // Let's iterate all units to find strong links for `link_val`.
        let link_mask = 1 << (link_val - 1);

        for unit in ALL_UNITS.iter() {
            let positions: Vec<usize> = unit
                .iter()
                .filter(|&&idx| self.cells[idx] == 0 && (self.candidates[idx] & link_mask) != 0)
                .cloned()
                .collect();

            if positions.len() == 2 {
                let p1 = positions[0];
                let p2 = positions[1];

                // Check connectivity
                // p1 must be seen by idx1 AND p2 seen by idx2 OR vice-versa.
                // Also, p1/p2 must be distinct from idx1/idx2 (usually true since idx1/2 are bivalue AB, and p1/p2 might be anything containing A)
                // Actually, idx1/idx2 can BE p1/p2 if they are in that unit.
                // But the definition "connected by a strong link" implies disjoint.
                // Let's stick to standard def: bivalues are endpoints. Strong link is in the middle.
                // So idx1 sees p1, idx2 sees p2. (Or idx1 sees p2, idx2 sees p1).

                let case1 = self.are_peers(idx1, p1) && self.are_peers(idx2, p2);
                let case2 = self.are_peers(idx1, p2) && self.are_peers(idx2, p1);

                if case1 || case2 {
                    // Valid W-Wing.
                    // Eliminate `elim_val` from cells seeing BOTH `idx1` and `idx2`.
                    let elims = self.get_common_peer_eliminations(idx1, idx2, elim_val);
                    if !elims.is_empty() {
                        return Some(SolvingStep {
                            technique: "W-Wing".to_string(),
                            placements: vec![],
                            eliminations: elims,
                            cause: vec![
                                CauseCell {
                                    index: idx1,
                                    candidates: vec![link_val, elim_val],
                                },
                                CauseCell {
                                    index: idx2,
                                    candidates: vec![link_val, elim_val],
                                },
                                // Optionally include the strong link cells in cause for highlighting
                                CauseCell {
                                    index: p1,
                                    candidates: vec![link_val],
                                },
                                CauseCell {
                                    index: p2,
                                    candidates: vec![link_val],
                                },
                            ],
                        });
                    }
                }
            }
        }
        None
    }

    #[inline]
    fn are_peers(&self, i1: usize, i2: usize) -> bool {
        // Fast check using PEER_MAP is too heavy if we iterate full map.
        // Just check row/col/box.
        if i1 == i2 {
            return false;
        } // A cell doesn't see itself in this context
        let r1 = i1 / 9;
        let c1 = i1 % 9;
        let r2 = i2 / 9;
        let c2 = i2 % 9;
        if r1 == r2 || c1 == c2 {
            return true;
        }
        let b1 = (r1 / 3) * 3 + (c1 / 3);
        let b2 = (r2 / 3) * 3 + (c2 / 3);
        b1 == b2
    }

    #[inline]
    fn get_common_peer_eliminations(&self, idx1: usize, idx2: usize, val: u8) -> Vec<Elimination> {
        let mask = 1 << (val - 1);
        let mut elims = Vec::new();
        // Intersection of peers
        for &peer in &PEER_MAP[idx1] {
            if PEER_MAP[idx2].contains(&peer)
                && self.cells[peer] == 0
                && (self.candidates[peer] & mask) != 0
            {
                elims.push(Elimination {
                    index: peer,
                    value: val,
                });
            }
        }
        elims
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
            // Advanced Techniques
            || try_fish_techniques(&mut board, &mut steps)
            || try_xy_wing(&mut board, &mut steps)
            || try_xyz_wing(&mut board, &mut steps)
            || try_skyscraper(&mut board, &mut steps)
            || try_two_string_kite(&mut board, &mut steps)
            // Master Techniques
            || try_unique_rectangle(&mut board, &mut steps)
            || try_w_wing(&mut board, &mut steps);

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

fn try_xy_wing(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    if let Some(step) = board.find_xy_wing() {
        for elim in &step.eliminations {
            board.candidates[elim.index] &= !(1 << (elim.value - 1));
        }
        steps.push(step);
        return true;
    }
    false
}

fn try_xyz_wing(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    if let Some(step) = board.find_xyz_wing() {
        for elim in &step.eliminations {
            board.candidates[elim.index] &= !(1 << (elim.value - 1));
        }
        steps.push(step);
        return true;
    }
    false
}

fn try_skyscraper(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    if let Some(step) = board.find_skyscraper() {
        for elim in &step.eliminations {
            board.candidates[elim.index] &= !(1 << (elim.value - 1));
        }
        steps.push(step);
        return true;
    }
    false
}

fn try_two_string_kite(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    if let Some(step) = board.find_two_string_kite() {
        for elim in &step.eliminations {
            board.candidates[elim.index] &= !(1 << (elim.value - 1));
        }
        steps.push(step);
        return true;
    }
    false
}

fn try_unique_rectangle(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    if let Some(step) = board.find_unique_rectangle_type_1() {
        for elim in &step.eliminations {
            board.candidates[elim.index] &= !(1 << (elim.value - 1));
        }
        steps.push(step);
        return true;
    }
    false
}

fn try_w_wing(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    if let Some(step) = board.find_w_wing() {
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
