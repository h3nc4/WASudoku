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
use crate::types::{CauseCell, Elimination, SolvingStep, Technique};

// --- Naked Subsets ---

pub fn find_naked_pair(board: &LogicalBoard) -> Option<SolvingStep> {
    find_naked_subset(board, 2, Technique::NakedPair)
}

pub fn find_naked_triple(board: &LogicalBoard) -> Option<SolvingStep> {
    find_naked_subset(board, 3, Technique::NakedTriple)
}

/// Finds `size` cells in one unit whose candidates together span exactly `size` digits.
pub fn find_naked_subset(
    board: &LogicalBoard,
    size: usize,
    technique: Technique,
) -> Option<SolvingStep> {
    for unit in ALL_UNITS.iter() {
        let unit_slice = *unit;
        let potential_indices = filter_naked_subset_candidates(board, unit_slice, size);
        if potential_indices.len() < size {
            continue;
        }

        let step = first_combination(&potential_indices, size, &mut |cells| {
            let union_mask = cells.iter().fold(0, |m, &i| m | board.candidates[i]);
            if union_mask.count_ones() as usize != size {
                return None;
            }
            construct_naked_subset_step(board, cells, union_mask, unit_slice, technique)
        });
        if step.is_some() {
            return step;
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

fn construct_naked_subset_step(
    board: &LogicalBoard,
    indices: &[usize],
    mask: u16,
    unit: &[usize],
    technique: Technique,
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
        technique,
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
    find_hidden_subset(board, 2, Technique::HiddenPair)
}

pub fn find_hidden_triple(board: &LogicalBoard) -> Option<SolvingStep> {
    find_hidden_subset(board, 3, Technique::HiddenTriple)
}

/// Finds `size` digits in one unit that together appear in exactly `size` cells.
pub fn find_hidden_subset(
    board: &LogicalBoard,
    size: usize,
    technique: Technique,
) -> Option<SolvingStep> {
    for unit in ALL_UNITS.iter() {
        let unit_slice = *unit;
        let pos_masks = get_candidate_positions_in_unit(board, unit_slice);
        let candidates = filter_hidden_subset_candidates(&pos_masks, size);
        if candidates.len() < size {
            continue;
        }

        let step = first_combination(&candidates, size, &mut |nums| {
            let combined_pos = nums.iter().fold(0, |m, &n| m | pos_masks[n]);
            if combined_pos.count_ones() as usize != size {
                return None;
            }
            let cell_indices = indices_from_unit_mask(unit_slice, combined_pos);
            let keep_mask = nums.iter().fold(0, |m, &n| m | (1 << (n - 1)));
            let subset_nums: Vec<u8> = nums.iter().map(|&n| n as u8).collect();
            construct_hidden_subset_step(board, &cell_indices, keep_mask, &subset_nums, technique)
        });
        if step.is_some() {
            return step;
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
    technique: Technique,
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
        technique,
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

/// Visits every `size`-combination of `items` in lexicographic order and returns the first hit.
fn first_combination<T>(
    items: &[usize],
    size: usize,
    visit: &mut dyn FnMut(&[usize]) -> Option<T>,
) -> Option<T> {
    fn walk<T>(
        items: &[usize],
        start: usize,
        size: usize,
        picked: &mut Vec<usize>,
        visit: &mut dyn FnMut(&[usize]) -> Option<T>,
    ) -> Option<T> {
        if picked.len() == size {
            return visit(picked);
        }
        for (i, &item) in items.iter().enumerate().skip(start) {
            picked.push(item);
            let found = walk(items, i + 1, size, picked, visit);
            picked.pop();
            if found.is_some() {
                return found;
            }
        }
        None
    }
    walk(items, 0, size, &mut Vec::with_capacity(size), visit)
}
