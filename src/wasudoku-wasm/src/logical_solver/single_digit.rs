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

use super::{LogicalBoard, PEER_MAP, mask_to_vec};
use crate::types::{CauseCell, Elimination, SolvingStep};

// --- Skyscraper ---

pub fn find_skyscraper(board: &LogicalBoard) -> Option<SolvingStep> {
    let (row_masks, col_masks) = board.get_all_fish_masks();

    for num in 1..=9 {
        // Check Rows base
        if let Some(step) = check_skyscraper(board, num, &row_masks[num], true) {
            return Some(step);
        }
        // Check Cols base
        if let Some(step) = check_skyscraper(board, num, &col_masks[num], false) {
            return Some(step);
        }
    }
    None
}

#[inline]
fn check_skyscraper(
    board: &LogicalBoard,
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
            if let Some(step) = check_skyscraper_pair(
                board,
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
    board: &LogicalBoard,
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
        if board.cells[target_idx] == 0
            && (board.candidates[target_idx] & cand_bit) != 0
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

// --- Two-String Kite ---

pub fn find_two_string_kite(board: &LogicalBoard) -> Option<SolvingStep> {
    let (row_masks, col_masks) = board.get_all_fish_masks();

    for num in 1..=9 {
        if let Some(step) = check_two_string_kite_for_num(board, num, &row_masks, &col_masks) {
            return Some(step);
        }
    }
    None
}

fn check_two_string_kite_for_num(
    board: &LogicalBoard,
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
                check_kite_intersection(board, num, r, c, row_masks[num][r], col_masks[num][c])
            {
                return Some(step);
            }
        }
    }
    None
}

fn check_kite_intersection(
    board: &LogicalBoard,
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

    find_kite_connection(board, num, [cell_r1, cell_r2], [cell_c1, cell_c2])
}

fn find_kite_connection(
    board: &LogicalBoard,
    num: usize,
    row_cells: [usize; 2],
    col_cells: [usize; 2],
) -> Option<SolvingStep> {
    for &rc in &row_cells {
        for &cc in &col_cells {
            if let Some(step) = check_kite_pair(board, num, rc, cc, row_cells, col_cells) {
                return Some(step);
            }
        }
    }
    None
}

fn check_kite_pair(
    board: &LogicalBoard,
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
        return construct_kite_step(board, num, rc, cc, other_rc, other_cc);
    }
    None
}

fn construct_kite_step(
    board: &LogicalBoard,
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
        if board.cells[target_idx] == 0
            && (board.candidates[target_idx] & cand_bit) != 0
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
