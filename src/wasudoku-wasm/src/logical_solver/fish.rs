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

use super::LogicalBoard;
use crate::types::{CauseCell, Elimination, SolvingStep};

struct FishSearchContext<'a> {
    num: u8,
    valid_indices: &'a [usize],
    masks: &'a [u16; 9],
    size: usize,
    is_row_base: bool,
    tech_name: &'a str,
}

pub fn find_fish_techniques(board: &LogicalBoard) -> Option<SolvingStep> {
    // Calculate masks once for all Fish.
    // Returns row_masks[num][row] and col_masks[num][col]
    let (row_masks, col_masks) = board.get_all_fish_masks();

    const FISH_CONFIGS: [(usize, &str); 3] = [(2, "X-Wing"), (3, "Swordfish"), (4, "Jellyfish")];

    for num in 1..=9 {
        for &(size, name) in &FISH_CONFIGS {
            if let Some(step) = check_fish(board, num, &row_masks[num], size, true, name) {
                return Some(step);
            }
            if let Some(step) = check_fish(board, num, &col_masks[num], size, false, name) {
                return Some(step);
            }
        }
    }
    None
}

/// Generalized Fish Finder (X-Wing, Swordfish, Jellyfish)
fn check_fish(
    board: &LogicalBoard,
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
    find_fish_combo(board, &ctx, 0, &mut Vec::with_capacity(size))
}

fn find_fish_combo(
    board: &LogicalBoard,
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
            return construct_fish_step(
                board,
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
        if let Some(step) = find_fish_combo(board, ctx, i + 1, combo) {
            return Some(step);
        }
        combo.pop();
    }
    None
}

/// Constructs the step if eliminations are found.
fn construct_fish_step(
    board: &LogicalBoard,
    num: u8,
    base_indices: &[usize],
    union_mask: u16,
    is_row_base: bool,
    tech_name: &str,
) -> Option<SolvingStep> {
    let cand_bit = 1 << (num - 1);
    let cover_indices: Vec<usize> = (0..9).filter(|&x| (union_mask & (1 << x)) != 0).collect();

    let cause_cells = collect_fish_causes(
        board,
        cand_bit,
        num,
        base_indices,
        &cover_indices,
        is_row_base,
    );
    let eliminations = collect_fish_eliminations(
        board,
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
    board: &LogicalBoard,
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

            if board.cells[cell_idx] == 0 && (board.candidates[cell_idx] & cand_bit) != 0 {
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
    board: &LogicalBoard,
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

            if board.cells[cell_idx] == 0 && (board.candidates[cell_idx] & cand_bit) != 0 {
                eliminations.push(Elimination {
                    index: cell_idx,
                    value: num,
                });
            }
        }
    }
    eliminations
}
