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

use super::{ALL_UNITS, LogicalBoard, PEER_MAP, mask_to_vec};
use crate::types::{Elimination, Placement, SolvingStep};

/// Searches for a cell with exactly one candidate.
pub fn find_naked_single(board: &LogicalBoard) -> Option<SolvingStep> {
    for i in 0..81 {
        if board.cells[i] == 0 && board.candidates[i].count_ones() == 1 {
            let value = (board.candidates[i].trailing_zeros() + 1) as u8;
            let eliminations = collect_peer_eliminations(board, i, value);

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

/// Searches for a candidate that appears only once in a specific group (row/col/box).
pub fn find_hidden_single(board: &LogicalBoard) -> Option<SolvingStep> {
    let all_units: &[&[usize]] = &ALL_UNITS;
    for unit in all_units.iter() {
        if let Some(step) = find_hidden_single_in_group(board, unit) {
            return Some(step);
        }
    }
    None
}

fn find_hidden_single_in_group(board: &LogicalBoard, group: &[usize]) -> Option<SolvingStep> {
    for num in 1..=9 {
        if let Some(target_idx) = find_unique_position_in_group(board, group, num) {
            let mask = 1 << (num - 1);
            let mut eliminations = collect_peer_eliminations(board, target_idx, num);

            // Internal eliminations: remove other candidates from the target cell
            let other_cands = board.candidates[target_idx] & !mask;
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

/// Helper to collect eliminations for Naked/Hidden Singles from peers.
#[inline]
fn collect_peer_eliminations(board: &LogicalBoard, index: usize, value: u8) -> Vec<Elimination> {
    PEER_MAP[index]
        .iter()
        .filter(|&&peer_idx| {
            board.cells[peer_idx] == 0 && (board.candidates[peer_idx] & (1 << (value - 1))) != 0
        })
        .map(|&peer_idx| Elimination {
            index: peer_idx,
            value,
        })
        .collect()
}

/// Helper to find the single index in a group where 'num' is a candidate.
#[inline]
fn find_unique_position_in_group(board: &LogicalBoard, group: &[usize], num: u8) -> Option<usize> {
    let mask = 1 << (num - 1);
    let mut count = 0;
    let mut target_idx = 0;

    for &idx in group {
        if board.cells[idx] == 0 && (board.candidates[idx] & mask) != 0 {
            count += 1;
            target_idx = idx;
            if count > 1 {
                return None; // Optimization: exit early if not unique
            }
        }
    }

    if count == 1 { Some(target_idx) } else { None }
}
