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

use super::{ALL_UNITS, LogicalBoard, PEER_MAP, mask_to_vec};
use crate::types::{CauseCell, Elimination, SolvingStep};

// --- XY-Wing ---

pub fn find_xy_wing(board: &LogicalBoard) -> Option<SolvingStep> {
    // Collect bi-value cells
    let bivalue_cells: Vec<usize> = (0..81)
        .filter(|&i| board.cells[i] == 0 && board.candidates[i].count_ones() == 2)
        .collect();

    if bivalue_cells.len() < 3 {
        return None;
    }

    for &pivot_idx in &bivalue_cells {
        if let Some(step) = find_xy_wing_for_pivot(board, pivot_idx) {
            return Some(step);
        }
    }
    None
}

fn find_xy_wing_for_pivot(board: &LogicalBoard, pivot_idx: usize) -> Option<SolvingStep> {
    let pivot_cands = mask_to_vec(board.candidates[pivot_idx]);
    let a = pivot_cands[0];
    let b = pivot_cands[1];

    // Find peers of pivot that are also bi-value
    let peer_bivalues: Vec<usize> = PEER_MAP[pivot_idx]
        .iter()
        .cloned()
        .filter(|&idx| {
            board.cells[idx] == 0
                && board.candidates[idx].count_ones() == 2
                && (board.candidates[idx] & board.candidates[pivot_idx]) != 0
        })
        .collect();

    for &p1_idx in &peer_bivalues {
        if let Some(step) = check_xy_wing_pincers(board, pivot_idx, p1_idx, &peer_bivalues, a, b) {
            return Some(step);
        }
    }
    None
}

fn check_xy_wing_pincers(
    board: &LogicalBoard,
    pivot_idx: usize,
    p1_idx: usize,
    peers: &[usize],
    a: u8,
    b: u8,
) -> Option<SolvingStep> {
    let p1_cands = board.candidates[p1_idx];
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
        if board.candidates[p2_idx] == target_mask {
            // Found a potential XY-Wing. Eliminate C from cells seen by BOTH P1 and P2
            let elims = find_xy_wing_eliminations(board, p1_idx, p2_idx, pivot_idx, c_val);

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
                            candidates: mask_to_vec(board.candidates[p1_idx]),
                        },
                        CauseCell {
                            index: p2_idx,
                            candidates: mask_to_vec(board.candidates[p2_idx]),
                        },
                    ],
                });
            }
        }
    }
    None
}

fn find_xy_wing_eliminations(
    board: &LogicalBoard,
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
            && board.cells[target_idx] == 0
            && (board.candidates[target_idx] & c_mask) != 0
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

// --- XYZ-Wing ---

pub fn find_xyz_wing(board: &LogicalBoard) -> Option<SolvingStep> {
    // Pivot must have 3 candidates
    let trivalue_cells: Vec<usize> = (0..81)
        .filter(|&i| board.cells[i] == 0 && board.candidates[i].count_ones() == 3)
        .collect();

    for &pivot_idx in &trivalue_cells {
        if let Some(step) = find_xyz_wing_for_pivot(board, pivot_idx) {
            return Some(step);
        }
    }
    None
}

fn find_xyz_wing_for_pivot(board: &LogicalBoard, pivot_idx: usize) -> Option<SolvingStep> {
    let pivot_mask = board.candidates[pivot_idx];

    // Find potential pincers: bivalue cells that are subsets of the pivot
    let potential_pincers: Vec<usize> = PEER_MAP[pivot_idx]
        .iter()
        .cloned()
        .filter(|&idx| {
            board.cells[idx] == 0
                && board.candidates[idx].count_ones() == 2
                && (board.candidates[idx] & !pivot_mask) == 0
        })
        .collect();

    if potential_pincers.len() < 2 {
        return None;
    }

    for i in 0..potential_pincers.len() {
        for j in (i + 1)..potential_pincers.len() {
            if let Some(step) = check_xyz_wing_pincers(
                board,
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
    board: &LogicalBoard,
    pivot: usize,
    p1: usize,
    p2: usize,
    pivot_mask: u16,
) -> Option<SolvingStep> {
    let m1 = board.candidates[p1];
    let m2 = board.candidates[p2];

    // Must have common candidate Z in ALL THREE cells
    let common_mask = pivot_mask & m1 & m2;
    if common_mask.count_ones() != 1 {
        return None;
    }

    let elim_val = (common_mask.trailing_zeros() + 1) as u8;
    let elim_bit = common_mask;

    // Find eliminations: cells that see Pivot AND P1 AND P2
    let mut elims = Vec::new();

    for &target_idx in &PEER_MAP[pivot] {
        if target_idx != p1
            && target_idx != p2
            && board.cells[target_idx] == 0
            && (board.candidates[target_idx] & elim_bit) != 0
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

// --- W-Wing ---

pub fn find_w_wing(board: &LogicalBoard) -> Option<SolvingStep> {
    let bivalue_cells = get_bivalue_cells(board);

    for i in 0..bivalue_cells.len() {
        for j in (i + 1)..bivalue_cells.len() {
            if let Some(step) = check_w_wing_pair(board, &bivalue_cells[i], &bivalue_cells[j]) {
                return Some(step);
            }
        }
    }
    None
}

#[inline]
fn get_bivalue_cells(board: &LogicalBoard) -> Vec<(usize, u16)> {
    (0..81)
        .filter(|&i| board.cells[i] == 0 && board.candidates[i].count_ones() == 2)
        .map(|i| (i, board.candidates[i]))
        .collect()
}

#[inline]
fn check_w_wing_pair(
    board: &LogicalBoard,
    cell1: &(usize, u16),
    cell2: &(usize, u16),
) -> Option<SolvingStep> {
    let (idx1, mask1) = *cell1;
    let (idx2, mask2) = *cell2;

    if mask1 != mask2 {
        return None;
    }

    if PEER_MAP[idx1].contains(&idx2) {
        return None;
    }

    let cands = mask_to_vec(mask1);
    let a = cands[0];
    let b = cands[1];

    if let Some(step) = check_w_wing_link(board, idx1, idx2, a, b) {
        return Some(step);
    }
    check_w_wing_link(board, idx1, idx2, b, a)
}

// Checks for a strong link on `link_val` connecting `idx1` and `idx2`.
// If found, eliminates `elim_val`.
fn check_w_wing_link(
    board: &LogicalBoard,
    idx1: usize,
    idx2: usize,
    link_val: u8,
    elim_val: u8,
) -> Option<SolvingStep> {
    // A strong link is a unit where `link_val` appears exactly twice.
    let link_mask = 1 << (link_val - 1);

    for unit in ALL_UNITS.iter() {
        let positions: Vec<usize> = unit
            .iter()
            .filter(|&&idx| board.cells[idx] == 0 && (board.candidates[idx] & link_mask) != 0)
            .cloned()
            .collect();

        if positions.len() == 2 {
            let p1 = positions[0];
            let p2 = positions[1];

            // Check connectivity
            let case1 = are_peers(idx1, p1) && are_peers(idx2, p2);
            let case2 = are_peers(idx1, p2) && are_peers(idx2, p1);

            if case1 || case2 {
                // Valid W-Wing.
                // Eliminate `elim_val` from cells seeing BOTH `idx1` and `idx2`.
                let elims = get_common_peer_eliminations(board, idx1, idx2, elim_val);
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
fn are_peers(i1: usize, i2: usize) -> bool {
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
fn get_common_peer_eliminations(
    board: &LogicalBoard,
    idx1: usize,
    idx2: usize,
    val: u8,
) -> Vec<Elimination> {
    let mask = 1 << (val - 1);
    let mut elims = Vec::new();
    // Intersection of peers
    for &peer in &PEER_MAP[idx1] {
        if PEER_MAP[idx2].contains(&peer)
            && board.cells[peer] == 0
            && (board.candidates[peer] & mask) != 0
        {
            elims.push(Elimination {
                index: peer,
                value: val,
            });
        }
    }
    elims
}
