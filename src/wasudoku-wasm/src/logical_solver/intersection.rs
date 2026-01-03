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

use super::{BOX_UNITS, COL_UNITS, LogicalBoard, ROW_UNITS};
use crate::types::{CauseCell, Elimination, SolvingStep};
use std::collections::HashSet;

// --- Pointing Subsets ---

/// Searches for Pointing Pairs/Triples.
/// A candidate in a box is confined to a single row or column -> eliminates from rest of row/col.
pub fn find_pointing_subset(board: &LogicalBoard) -> Option<SolvingStep> {
    for (box_idx, box_unit) in BOX_UNITS.iter().enumerate() {
        for num in 1..=9 {
            // Gather all cells in this box that have candidate 'num'
            let mask = 1 << (num - 1);
            let cells: Vec<usize> = box_unit
                .iter()
                .filter(|&&i| board.cells[i] == 0 && (board.candidates[i] & mask) != 0)
                .cloned()
                .collect();

            if cells.len() < 2 || cells.len() > 3 {
                continue;
            }

            // Check alignment
            if let Some(step) = check_pointing_alignment(board, &cells, box_idx, num) {
                return Some(step);
            }
        }
    }
    None
}

/// Checks if cells align in Row or Column and generates Pointing step.
#[inline]
fn check_pointing_alignment(
    board: &LogicalBoard,
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
        let elims = collect_pointing_elims(
            board,
            num,
            mask,
            |col| row0 * 9 + col, // Coordinate mapper for Row
            box_idx,
        );
        if !elims.is_empty() {
            return Some(build_pointing_step(cells, elims, num));
        }
    }

    if same_col {
        let elims = collect_pointing_elims(
            board,
            num,
            mask,
            |row| row * 9 + col0, // Coordinate mapper for Col
            box_idx,
        );
        if !elims.is_empty() {
            return Some(build_pointing_step(cells, elims, num));
        }
    }
    None
}

/// Generic helper to collect eliminations for Pointing pairs.
/// Iterates 0..9 using a coordinate mapper (to traverse row or col).
#[inline]
fn collect_pointing_elims<F>(
    board: &LogicalBoard,
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
            && board.cells[idx] == 0
            && (board.candidates[idx] & mask) != 0
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
fn build_pointing_step(cells: &[usize], elims: Vec<Elimination>, num: u8) -> SolvingStep {
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

// --- Claiming Candidates ---

/// Searches for Claiming Candidates (Box-Line Reduction).
/// A candidate in a row/col is confined to a single box -> eliminates from rest of box.
pub fn find_claiming_candidates(board: &LogicalBoard) -> Option<SolvingStep> {
    // Check Rows
    for row in 0..9 {
        if let Some(step) = find_claiming_in_unit(board, row, true) {
            return Some(step);
        }
    }
    // Check Columns
    for col in 0..9 {
        if let Some(step) = find_claiming_in_unit(board, col, false) {
            return Some(step);
        }
    }
    None
}

/// Generic check for Claiming Candidates in a linear unit (row or col).
#[inline]
fn find_claiming_in_unit(
    board: &LogicalBoard,
    unit_idx: usize,
    is_row: bool,
) -> Option<SolvingStep> {
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
            if board.cells[idx] == 0 && (board.candidates[idx] & mask) != 0 {
                cells.push(idx);
                box_indices.insert((idx / 9 / 3) * 3 + (idx % 9 / 3));
            }
        }

        // If all candidates are in exactly one box, we can eliminate
        if !cells.is_empty() && box_indices.len() == 1 {
            let box_idx = *box_indices.iter().next().unwrap();
            let elims = collect_claiming_elims(board, box_idx, unit_idx, is_row, num, mask);

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
    board: &LogicalBoard,
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
        if !line_match && board.cells[idx] == 0 && (board.candidates[idx] & mask) != 0 {
            elims.push(Elimination {
                index: idx,
                value: num,
            });
        }
    }
    elims
}
