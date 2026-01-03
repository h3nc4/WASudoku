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

use super::{ALL_UNITS, LogicalBoard, mask_to_vec};
use crate::types::{CauseCell, Elimination, SolvingStep};

// --- Naked Subsets ---

pub fn find_naked_pair(board: &LogicalBoard) -> Option<SolvingStep> {
    for unit in ALL_UNITS.iter() {
        // Filter to cells with exactly 2 candidates
        let unit_slice = *unit;
        let potential_indices = filter_naked_subset_candidates(board, unit_slice, 2);

        if potential_indices.len() < 2 {
            continue;
        }

        // Check all pairs
        for i in 0..potential_indices.len() {
            for j in (i + 1)..potential_indices.len() {
                if let Some(step) = check_naked_pair(
                    board,
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

pub fn find_naked_triple(board: &LogicalBoard) -> Option<SolvingStep> {
    for unit in ALL_UNITS.iter() {
        let unit_slice = *unit;
        // Filter cells with 2 or 3 candidates
        let potential_indices = filter_naked_subset_candidates(board, unit_slice, 3);

        if potential_indices.len() < 3 {
            continue;
        }

        if let Some(step) = check_naked_triple_combinations(board, &potential_indices, unit_slice) {
            return Some(step);
        }
    }
    None
}

#[inline]
fn filter_naked_subset_candidates(board: &LogicalBoard, unit: &[usize], size: usize) -> Vec<usize> {
    unit.iter()
        .filter(|&&i| {
            let c = board.candidates[i].count_ones() as usize;
            board.cells[i] == 0 && c >= 2 && c <= size
        })
        .cloned()
        .collect()
}

#[inline]
fn check_naked_pair(
    board: &LogicalBoard,
    idx1: usize,
    idx2: usize,
    unit: &[usize],
) -> Option<SolvingStep> {
    let mask = board.candidates[idx1];
    if mask == board.candidates[idx2] && mask.count_ones() == 2 {
        return construct_naked_subset_step(board, &[idx1, idx2], mask, unit, "NakedPair");
    }
    None
}

#[inline]
fn check_naked_triple_combinations(
    board: &LogicalBoard,
    indices: &[usize],
    unit: &[usize],
) -> Option<SolvingStep> {
    let len = indices.len();
    for i in 0..len {
        for j in (i + 1)..len {
            for k in (j + 1)..len {
                if let Some(step) =
                    check_naked_triple(board, indices[i], indices[j], indices[k], unit)
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
    board: &LogicalBoard,
    idx1: usize,
    idx2: usize,
    idx3: usize,
    unit: &[usize],
) -> Option<SolvingStep> {
    let union_mask = board.candidates[idx1] | board.candidates[idx2] | board.candidates[idx3];

    if union_mask.count_ones() == 3 {
        return construct_naked_subset_step(
            board,
            &[idx1, idx2, idx3],
            union_mask,
            unit,
            "NakedTriple",
        );
    }
    None
}

fn construct_naked_subset_step(
    board: &LogicalBoard,
    indices: &[usize],
    mask: u16,
    unit: &[usize],
    technique: &str,
) -> Option<SolvingStep> {
    let mut eliminations = Vec::new();
    let cands = mask_to_vec(mask);

    for &idx in unit {
        if !indices.contains(&idx) && board.cells[idx] == 0 && (board.candidates[idx] & mask) != 0 {
            for &val in &cands {
                if (board.candidates[idx] & (1 << (val - 1))) != 0 {
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

// --- Hidden Subsets ---

pub fn find_hidden_pair(board: &LogicalBoard) -> Option<SolvingStep> {
    for unit in ALL_UNITS.iter() {
        let unit_slice = *unit;
        let pos_masks = get_candidate_positions_in_unit(board, unit_slice);
        let candidates = filter_hidden_subset_candidates(&pos_masks, 2);

        if candidates.len() < 2 {
            continue;
        }

        for i in 0..candidates.len() {
            for j in (i + 1)..candidates.len() {
                if let Some(step) =
                    check_hidden_pair(board, candidates[i], candidates[j], &pos_masks, unit_slice)
                {
                    return Some(step);
                }
            }
        }
    }
    None
}

pub fn find_hidden_triple(board: &LogicalBoard) -> Option<SolvingStep> {
    for unit in ALL_UNITS.iter() {
        let unit_slice = *unit;
        let pos_masks = get_candidate_positions_in_unit(board, unit_slice);
        let candidates = filter_hidden_subset_candidates(&pos_masks, 3);

        if candidates.len() < 3 {
            continue;
        }

        if let Some(step) =
            check_hidden_triple_combinations(board, &candidates, &pos_masks, unit_slice)
        {
            return Some(step);
        }
    }
    None
}

/// Creates a map of where each candidate appears in a unit.
/// Returns `[u16; 10]` where index `n` (1-9) is a bitmask of positions (0-8) in the unit.
#[inline]
fn get_candidate_positions_in_unit(board: &LogicalBoard, unit: &[usize]) -> [u16; 10] {
    let mut positions = [0u16; 10];
    for (pos, &idx) in unit.iter().enumerate() {
        if board.cells[idx] == 0 {
            let mut c = board.candidates[idx];
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
fn filter_hidden_subset_candidates(pos_masks: &[u16; 10], size: usize) -> Vec<usize> {
    (1..=9)
        .filter(|&n| {
            let c = pos_masks[n].count_ones() as usize;
            c >= 2 && c <= size
        })
        .collect()
}

#[inline]
fn check_hidden_pair(
    board: &LogicalBoard,
    n1: usize,
    n2: usize,
    pos_masks: &[u16; 10],
    unit: &[usize],
) -> Option<SolvingStep> {
    if pos_masks[n1] == pos_masks[n2] && pos_masks[n1].count_ones() == 2 {
        let mask_in_unit = pos_masks[n1];
        let cell_indices = indices_from_unit_mask(unit, mask_in_unit);

        let keep_mask = (1 << (n1 - 1)) | (1 << (n2 - 1));
        return construct_hidden_subset_step(
            board,
            &cell_indices,
            keep_mask,
            &[n1 as u8, n2 as u8],
            "HiddenPair",
        );
    }
    None
}

#[inline]
fn check_hidden_triple_combinations(
    board: &LogicalBoard,
    candidates: &[usize],
    pos_masks: &[u16; 10],
    unit: &[usize],
) -> Option<SolvingStep> {
    let len = candidates.len();
    for i in 0..len {
        for j in (i + 1)..len {
            for k in (j + 1)..len {
                if let Some(step) = check_hidden_triple(
                    board,
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
    board: &LogicalBoard,
    n1: usize,
    n2: usize,
    n3: usize,
    pos_masks: &[u16; 10],
    unit: &[usize],
) -> Option<SolvingStep> {
    let combined_pos = pos_masks[n1] | pos_masks[n2] | pos_masks[n3];
    if combined_pos.count_ones() == 3 {
        let cell_indices = indices_from_unit_mask(unit, combined_pos);
        let keep_mask = (1 << (n1 - 1)) | (1 << (n2 - 1)) | (1 << (n3 - 1));

        return construct_hidden_subset_step(
            board,
            &cell_indices,
            keep_mask,
            &[n1 as u8, n2 as u8, n3 as u8],
            "HiddenTriple",
        );
    }
    None
}

#[inline]
fn indices_from_unit_mask(unit: &[usize], mask: u16) -> Vec<usize> {
    let mut indices = Vec::with_capacity(mask.count_ones() as usize);
    for (i, &cell_idx) in unit.iter().enumerate() {
        if (mask & (1 << i)) != 0 {
            indices.push(cell_idx);
        }
    }
    indices
}

fn construct_hidden_subset_step(
    board: &LogicalBoard,
    indices: &[usize],
    keep_mask: u16,
    subset_nums: &[u8],
    technique: &str,
) -> Option<SolvingStep> {
    let mut eliminations = Vec::new();
    for &idx in indices {
        let other = board.candidates[idx] & !keep_mask;
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
