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

use super::{LogicalBoard, mask_to_vec};
use crate::types::{CauseCell, Elimination, SolvingStep};

/// Searches for Unique Rectangle Type 1.
pub fn find_unique_rectangle_type_1(board: &LogicalBoard) -> Option<SolvingStep> {
    for r1 in 0..9 {
        for r2 in (r1 + 1)..9 {
            for c1 in 0..9 {
                for c2 in (c1 + 1)..9 {
                    if let Some(step) = check_ur_for_coords(board, r1, r2, c1, c2) {
                        return Some(step);
                    }
                }
            }
        }
    }
    None
}

#[inline]
fn check_ur_for_coords(
    board: &LogicalBoard,
    r1: usize,
    r2: usize,
    c1: usize,
    c2: usize,
) -> Option<SolvingStep> {
    let idx_tl = r1 * 9 + c1;
    let idx_tr = r1 * 9 + c2;
    let idx_bl = r2 * 9 + c1;
    let idx_br = r2 * 9 + c2;

    let indices = [idx_tl, idx_tr, idx_bl, idx_br];

    if !is_valid_ur_geometry(&indices) {
        return None;
    }

    // All cells must be empty
    if indices.iter().any(|&i| board.cells[i] != 0) {
        return None;
    }

    solve_ur_type_1(board, &indices)
}

#[inline]
fn is_valid_ur_geometry(indices: &[usize; 4]) -> bool {
    let b_tl = get_box_index(indices[0]);
    let b_tr = get_box_index(indices[1]);
    let b_bl = get_box_index(indices[2]);
    let b_br = get_box_index(indices[3]);

    // Case 1: Vertical sharing (Floor/Ceiling in different boxes)
    if b_tl == b_bl && b_tr == b_br && b_tl != b_tr {
        return true;
    }
    // Case 2: Horizontal sharing (Walls in different boxes)
    if b_tl == b_tr && b_bl == b_br && b_tl != b_bl {
        return true;
    }

    false
}

#[inline]
fn get_box_index(idx: usize) -> usize {
    (idx / 27) * 3 + (idx % 9) / 3
}

fn solve_ur_type_1(board: &LogicalBoard, indices: &[usize; 4]) -> Option<SolvingStep> {
    let masks: Vec<u16> = indices.iter().map(|&i| board.candidates[i]).collect();

    // Check if we have at least 3 bivalue cells with the same mask
    let mut common_mask = 0;
    let mut bivalue_count = 0;

    for i in 0..4 {
        if masks[i].count_ones() == 2 {
            let count = masks.iter().filter(|&&m| m == masks[i]).count();
            if count >= 3 {
                bivalue_count = count;
                common_mask = masks[i];
                break;
            }
        }
    }

    if bivalue_count < 3 {
        return None;
    }

    // Find the "target" cell
    for i in 0..4 {
        let mask = masks[i];
        if mask != common_mask && (mask & common_mask) == common_mask {
            let elim_vals = mask_to_vec(common_mask);
            let eliminations: Vec<Elimination> = elim_vals
                .iter()
                .map(|&val| Elimination {
                    index: indices[i],
                    value: val,
                })
                .collect();

            let cause: Vec<CauseCell> = indices
                .iter()
                .enumerate()
                .filter(|&(idx, _)| idx != i)
                .map(|(_, &cell_idx)| CauseCell {
                    index: cell_idx,
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

    None
}
