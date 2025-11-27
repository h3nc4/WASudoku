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
use std::collections::HashMap;
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
}

/// Convert a bitmask of candidates into a `Vec` of numbers.
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
    /// Create a `LogicalBoard` from a simple `Board` by calculating initial candidates.
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

    /// Place a number on the board and update the candidates of its peers.
    fn set_cell(&mut self, index: usize, value: u8) -> bool {
        if self.cells[index] != 0 {
            return false;
        }
        self.cells[index] = value;
        self.candidates[index] = 0;
        self.eliminate_from_peers(index, value);
        true
    }

    /// Eliminate a candidate from all peer cells of a given index.
    fn eliminate_from_peers(&mut self, index: usize, value: u8) {
        let elimination_mask = !(1 << (value - 1));
        for &peer_index in &PEER_MAP[index] {
            self.candidates[peer_index] &= elimination_mask;
        }
    }

    /// Find the first available "Naked Single" on the board.
    /// A Naked Single is a cell that has only one possible candidate.
    fn find_naked_single(&self) -> Option<SolvingStep> {
        for i in 0..81 {
            if self.cells[i] == 0 && self.candidates[i].count_ones() == 1 {
                let value = (self.candidates[i].trailing_zeros() + 1) as u8;
                let eliminations = PEER_MAP[i]
                    .iter()
                    .filter(|&&peer_idx| {
                        self.cells[peer_idx] == 0
                            && (self.candidates[peer_idx] & (1 << (value - 1))) != 0
                    })
                    .map(|&peer_idx| Elimination {
                        index: peer_idx,
                        value,
                    })
                    .collect();

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

    /// Find a "Hidden Single" in a given group of cells (row, column, or box).
    /// A Hidden Single is a candidate that appears only once within a unit.
    fn find_hidden_single_in_group(&self, group: &[usize]) -> Option<SolvingStep> {
        for num in 1..=9 {
            if let Some(step) = self.try_find_hidden_single_for_number(group, num) {
                return Some(step);
            }
        }
        None
    }

    /// Try to find a hidden single for a specific number in a group.
    fn try_find_hidden_single_for_number(&self, group: &[usize], num: u8) -> Option<SolvingStep> {
        let mask = 1 << (num - 1);
        let potential_indices: Vec<usize> = group
            .iter()
            .filter(|&&index| self.cells[index] == 0 && (self.candidates[index] & mask) != 0)
            .cloned()
            .collect();

        if potential_indices.len() != 1 {
            return None;
        }

        let index = potential_indices[0];
        let value = num;
        let mut eliminations = self.collect_peer_eliminations(index, value);

        // Also eliminate other candidates from the cell itself.
        eliminations.extend(self.collect_cell_eliminations(index, value));

        Some(SolvingStep {
            technique: "HiddenSingle".to_string(),
            placements: vec![Placement { index, value }],
            eliminations,
            cause: vec![],
        })
    }

    /// Collect eliminations from peer cells for a given index and value.
    fn collect_peer_eliminations(&self, index: usize, value: u8) -> Vec<Elimination> {
        let mask = 1 << (value - 1);
        PEER_MAP[index]
            .iter()
            .filter(|&&p_idx| self.cells[p_idx] == 0 && (self.candidates[p_idx] & mask) != 0)
            .map(|&p_idx| Elimination {
                index: p_idx,
                value,
            })
            .collect()
    }

    /// Collect eliminations for other candidates in the same cell.
    fn collect_cell_eliminations(&self, index: usize, value: u8) -> Vec<Elimination> {
        (1..=9)
            .filter(|&cand| cand != value && (self.candidates[index] & (1 << (cand - 1))) != 0)
            .map(|cand| Elimination { index, value: cand })
            .collect()
    }

    /// Find Naked Subsets (Pairs, Triples) in any unit.
    /// A Naked Pair is two cells in the same unit that have the exact same two candidates.
    fn find_naked_subset(&self, size: usize) -> Option<SolvingStep> {
        let tech_name = self.get_technique_name(size, false);

        for unit in ALL_UNITS.iter() {
            if let Some(step) = self.find_naked_subset_in_unit(unit, size, &tech_name) {
                return Some(step);
            }
        }
        None
    }

    /// Get the technique name based on subset size.
    fn get_technique_name(&self, size: usize, is_hidden: bool) -> String {
        let prefix = if is_hidden { "Hidden" } else { "Naked" };
        let suffix = match size {
            2 => "Pair",
            3 => "Triple",
            _ => "Subset",
        };
        format!("{}{}", prefix, suffix)
    }

    /// Find a naked subset within a specific unit.
    fn find_naked_subset_in_unit(
        &self,
        unit: &[usize],
        size: usize,
        tech_name: &str,
    ) -> Option<SolvingStep> {
        let empty_cells: Vec<usize> = unit
            .iter()
            .filter(|&&i| self.cells[i] == 0 && self.candidates[i].count_ones() as usize <= size)
            .cloned()
            .collect();

        if empty_cells.len() < size {
            return None;
        }

        // Brute-force combinations of cells to find a naked subset.
        // For 9x9 sudoku, unit length is 9, so combinations are small.
        let combinations = Self::get_combinations(&empty_cells, size);

        for combo in combinations {
            let mut combined_mask = 0;
            for &idx in &combo {
                combined_mask |= self.candidates[idx];
            }

            if combined_mask.count_ones() as usize == size {
                let eliminations =
                    self.collect_naked_subset_eliminations(unit, &combo, combined_mask);

                if !eliminations.is_empty() {
                    let cause_cands = mask_to_vec(combined_mask);
                    return Some(SolvingStep {
                        technique: tech_name.to_string(),
                        placements: vec![],
                        eliminations,
                        cause: combo
                            .iter()
                            .map(|&idx| CauseCell {
                                index: idx,
                                candidates: cause_cands.clone(),
                            })
                            .collect(),
                    });
                }
            }
        }
        None
    }

    /// Simple recursive combination generator.
    fn get_combinations<T: Copy>(pool: &[T], k: usize) -> Vec<Vec<T>> {
        if k == 0 {
            return vec![vec![]];
        }
        if pool.is_empty() {
            return vec![];
        }

        let head = pool[0];
        let mut res = Self::get_combinations(&pool[1..], k - 1);
        for v in &mut res {
            v.push(head);
        }
        res.extend(Self::get_combinations(&pool[1..], k));
        res
    }

    /// Collect eliminations for a naked subset.
    fn collect_naked_subset_eliminations(
        &self,
        unit: &[usize],
        cause_cells: &[usize],
        combined_mask: u16,
    ) -> Vec<Elimination> {
        let mut eliminations = Vec::new();

        for &cell_idx in unit.iter() {
            if cause_cells.contains(&cell_idx) || self.cells[cell_idx] != 0 {
                continue;
            }

            if (self.candidates[cell_idx] & combined_mask) != 0 {
                for cand in mask_to_vec(combined_mask) {
                    if (self.candidates[cell_idx] & (1 << (cand - 1))) != 0 {
                        eliminations.push(Elimination {
                            index: cell_idx,
                            value: cand,
                        });
                    }
                }
            }
        }

        eliminations
    }

    /// Find Hidden Subsets (Pairs, Triples) in any unit.
    fn find_hidden_subset(&self, size: usize) -> Option<SolvingStep> {
        let tech_name = self.get_technique_name(size, true);

        for unit in ALL_UNITS.iter() {
            if let Some(step) = self.find_hidden_subset_in_unit(unit, size, &tech_name) {
                return Some(step);
            }
        }
        None
    }

    fn find_hidden_subset_in_unit(
        &self,
        unit: &[usize],
        size: usize,
        tech_name: &str,
    ) -> Option<SolvingStep> {
        // 1. Map each candidate (1-9) to the list of cell indices in this unit where it appears.
        let mut candidate_locations: HashMap<u8, Vec<usize>> = HashMap::new();
        for num in 1..=9 {
            let mask = 1 << (num - 1);
            for &idx in unit {
                if self.cells[idx] == 0 && (self.candidates[idx] & mask) != 0 {
                    candidate_locations.entry(num).or_default().push(idx);
                }
            }
        }

        // 2. Get all candidates that appear at least once in the unit.
        let all_candidates: Vec<u8> = candidate_locations
            .keys()
            .filter(|&k| !candidate_locations[k].is_empty())
            .cloned()
            .collect();

        if all_candidates.len() < size {
            return None;
        }

        // 3. Try all combinations of 'size' candidates.
        let candidate_combos = Self::get_combinations(&all_candidates, size);

        for combo in candidate_combos {
            // Collect all unique cell indices where these candidates appear.
            let mut cells: HashSet<usize> = HashSet::new();
            for &cand in &combo {
                if let Some(locs) = candidate_locations.get(&cand) {
                    for &loc in locs {
                        cells.insert(loc);
                    }
                }
            }

            // For a hidden subset: 'size' candidates must appear in exactly 'size' cells
            // and be confined to those cells only.
            if cells.len() != size {
                continue;
            }

            // Verify that each candidate in the combo appears at least once in the subset cells.
            // This ensures all candidates are actually present.
            let mut all_present = true;
            for &cand in &combo {
                if let Some(locs) = candidate_locations.get(&cand) {
                    if locs.is_empty() {
                        all_present = false;
                        break;
                    }
                } else {
                    all_present = false;
                    break;
                }
            }

            if !all_present {
                continue;
            }

            let cell_vec: Vec<usize> = cells.into_iter().collect();
            let combo_mask = combo.iter().fold(0, |acc, &val| acc | (1 << (val - 1)));

            // 4. Collect eliminations: remove *other* candidates from these cells.
            let mut eliminations = Vec::new();
            for &idx in &cell_vec {
                let other_candidates = self.candidates[idx] & !combo_mask;
                if other_candidates != 0 {
                    for cand in mask_to_vec(other_candidates) {
                        eliminations.push(Elimination {
                            index: idx,
                            value: cand,
                        });
                    }
                }
            }

            if !eliminations.is_empty() {
                return Some(SolvingStep {
                    technique: tech_name.to_string(),
                    placements: vec![],
                    eliminations,
                    cause: cell_vec
                        .iter()
                        .map(|&idx| CauseCell {
                            index: idx,
                            candidates: combo.clone(),
                        })
                        .collect(),
                });
            }
        }

        None
    }

    /// Find Pointing Pairs/Triples.
    /// This occurs when a candidate within a box is confined to a single row or column.
    fn find_pointing_subset(&self) -> Option<SolvingStep> {
        for box_unit in BOX_UNITS.iter() {
            for num in 1..=9 {
                if let Some(step) = self.try_find_pointing_subset_in_box(box_unit, num) {
                    return Some(step);
                }
            }
        }
        None
    }

    /// Try to find a pointing subset for a specific number in a box.
    fn try_find_pointing_subset_in_box(&self, box_unit: &[usize], num: u8) -> Option<SolvingStep> {
        let mask = 1 << (num - 1);
        let cells_with_cand: Vec<usize> = box_unit
            .iter()
            .filter(|&&i| self.cells[i] == 0 && (self.candidates[i] & mask) != 0)
            .cloned()
            .collect();

        if cells_with_cand.len() < 2 || cells_with_cand.len() > 3 {
            return None;
        }

        let first_row = cells_with_cand[0] / 9;
        let first_col = cells_with_cand[0] % 9;

        let all_in_same_row = cells_with_cand.iter().all(|&i| i / 9 == first_row);
        let all_in_same_col = cells_with_cand.iter().all(|&i| i % 9 == first_col);

        if all_in_same_row {
            return self.create_pointing_subset_step_for_row(
                box_unit,
                &cells_with_cand,
                first_row,
                num,
                mask,
            );
        }

        if all_in_same_col {
            return self.create_pointing_subset_step_for_col(
                box_unit,
                &cells_with_cand,
                first_col,
                num,
                mask,
            );
        }

        None
    }

    /// Create a pointing subset step for a row alignment.
    fn create_pointing_subset_step_for_row(
        &self,
        box_unit: &[usize],
        cells_with_cand: &[usize],
        first_row: usize,
        num: u8,
        mask: u16,
    ) -> Option<SolvingStep> {
        let mut elims = Vec::new();

        for col in 0..9 {
            let idx = first_row * 9 + col;
            if !box_unit.contains(&idx)
                && self.cells[idx] == 0
                && (self.candidates[idx] & mask) != 0
            {
                elims.push(Elimination {
                    index: idx,
                    value: num,
                });
            }
        }

        if elims.is_empty() {
            return None;
        }

        Some(self.build_pointing_subset_step(cells_with_cand, elims, num))
    }

    /// Create a pointing subset step for a column alignment.
    fn create_pointing_subset_step_for_col(
        &self,
        box_unit: &[usize],
        cells_with_cand: &[usize],
        first_col: usize,
        num: u8,
        mask: u16,
    ) -> Option<SolvingStep> {
        let mut elims = Vec::new();

        for row in 0..9 {
            let idx = row * 9 + first_col;
            if !box_unit.contains(&idx)
                && self.cells[idx] == 0
                && (self.candidates[idx] & mask) != 0
            {
                elims.push(Elimination {
                    index: idx,
                    value: num,
                });
            }
        }

        if elims.is_empty() {
            return None;
        }

        Some(self.build_pointing_subset_step(cells_with_cand, elims, num))
    }

    /// Build a SolvingStep for a pointing subset.
    fn build_pointing_subset_step(
        &self,
        cells_with_cand: &[usize],
        elims: Vec<Elimination>,
        num: u8,
    ) -> SolvingStep {
        let technique = if cells_with_cand.len() == 2 {
            "PointingPair".to_string()
        } else {
            "PointingTriple".to_string()
        };

        SolvingStep {
            technique,
            placements: vec![],
            eliminations: elims,
            cause: cells_with_cand
                .iter()
                .map(|&idx| CauseCell {
                    index: idx,
                    candidates: vec![num],
                })
                .collect(),
        }
    }

    /// Find Claiming Candidates (Box-Line Reduction).
    /// If a candidate in a row (or col) is confined to one box, it can be removed from the rest of that box.
    fn find_claiming_candidates(&self) -> Option<SolvingStep> {
        // Check Rows
        for row in 0..9 {
            if let Some(step) = self.find_claiming_in_linear_unit(row, true) {
                return Some(step);
            }
        }
        // Check Columns
        for col in 0..9 {
            if let Some(step) = self.find_claiming_in_linear_unit(col, false) {
                return Some(step);
            }
        }
        None
    }

    fn find_claiming_in_linear_unit(&self, unit_idx: usize, is_row: bool) -> Option<SolvingStep> {
        let unit = if is_row {
            &ROW_UNITS[unit_idx]
        } else {
            &COL_UNITS[unit_idx]
        };

        for num in 1..=9 {
            let mask = 1 << (num - 1);
            let mut cells_with_cand = Vec::new();
            let mut box_indices = HashSet::new();

            for &idx in unit.iter() {
                if self.cells[idx] == 0 && (self.candidates[idx] & mask) != 0 {
                    cells_with_cand.push(idx);
                    box_indices.insert((idx / 9 / 3) * 3 + (idx % 9 / 3));
                }
            }

            if cells_with_cand.is_empty() || box_indices.len() != 1 {
                continue;
            }

            let box_idx = *box_indices.iter().next().unwrap();
            let box_cells = &BOX_UNITS[box_idx];
            let mut elims = Vec::new();

            for &idx in box_cells.iter() {
                // If cell is in the box but NOT in the current row/col unit
                if !unit.contains(&idx)
                    && self.cells[idx] == 0
                    && (self.candidates[idx] & mask) != 0
                {
                    elims.push(Elimination {
                        index: idx,
                        value: num,
                    });
                }
            }

            if !elims.is_empty() {
                return Some(SolvingStep {
                    technique: "ClaimingCandidate".to_string(),
                    placements: vec![],
                    eliminations: elims,
                    cause: cells_with_cand
                        .iter()
                        .map(|&idx| CauseCell {
                            index: idx,
                            candidates: vec![num],
                        })
                        .collect(),
                });
            }
        }
        None
    }
}

/// Solve the board by repeatedly applying logical techniques and return the steps.
pub fn solve_with_steps(initial_board: &Board) -> (Vec<SolvingStep>, Board) {
    let mut board = LogicalBoard::from_board(initial_board);
    let mut steps = Vec::new();

    loop {
        let progress = try_naked_single(&mut board, &mut steps)
            || try_hidden_single(&mut board, &mut steps)
            || try_naked_subset(&mut board, &mut steps, 2) // Naked Pair
            || try_naked_subset(&mut board, &mut steps, 3) // Naked Triple
            || try_pointing_subset(&mut board, &mut steps)
            || try_hidden_subset(&mut board, &mut steps, 2) // Hidden Pair
            || try_hidden_subset(&mut board, &mut steps, 3) // Hidden Triple
            || try_claiming_candidate(&mut board, &mut steps);

        if !progress {
            break;
        }
    }

    (steps, Board { cells: board.cells })
}

/// Try to apply a naked single technique.
fn try_naked_single(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    if let Some(step) = board.find_naked_single() {
        board.set_cell(step.placements[0].index, step.placements[0].value);
        steps.push(step);
        return true;
    }
    false
}

/// Try to apply a hidden single technique across all units.
fn try_hidden_single(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>) -> bool {
    for unit in ALL_UNITS.iter() {
        if let Some(step) = board.find_hidden_single_in_group(unit) {
            board.set_cell(step.placements[0].index, step.placements[0].value);
            steps.push(step);
            return true;
        }
    }
    false
}

/// Try to apply a naked subset technique of given size.
fn try_naked_subset(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>, size: usize) -> bool {
    if let Some(step) = board.find_naked_subset(size) {
        for elim in &step.eliminations {
            board.candidates[elim.index] &= !(1 << (elim.value - 1));
        }
        steps.push(step);
        return true;
    }
    false
}

/// Try to apply a pointing subset technique.
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

/// Try to apply a hidden subset technique of given size.
fn try_hidden_subset(board: &mut LogicalBoard, steps: &mut Vec<SolvingStep>, size: usize) -> bool {
    if let Some(step) = board.find_hidden_subset(size) {
        for elim in &step.eliminations {
            board.candidates[elim.index] &= !(1 << (elim.value - 1));
        }
        steps.push(step);
        return true;
    }
    false
}

/// Try to apply a claiming candidate technique.
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
            _ => TechniqueLevel::None,
        })
        .max()
        .unwrap_or(TechniqueLevel::None);

    (max_level, final_board)
}
