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

use super::LogicalBoard;
use crate::geometry::{BOXES, COLS, MAX_DIGIT, ROWS, SIZE, box_of, cell, col_of, row_of};
use crate::types::{CauseCell, Elimination, SolvingStep, Technique};

// --- Pointing Subsets ---

/// Searches for Pointing Pairs/Triples.
/// A candidate in a box is confined to a single row or column -> eliminates from rest of row/col.
pub fn find_pointing_subset(board: &LogicalBoard) -> Option<SolvingStep> {
    for (box_idx, box_unit) in BOXES.iter().enumerate() {
        for num in 1..=MAX_DIGIT {
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
    let row0 = row_of(cells[0]);
    let col0 = col_of(cells[0]);
    let same_row = cells.iter().all(|&c| row_of(c) == row0);
    let same_col = cells.iter().all(|&c| col_of(c) == col0);
    let mask = 1 << (num - 1);

    if same_row {
        let elims = collect_pointing_elims(
            board,
            num,
            mask,
            |col| cell(row0, col), // Coordinate mapper for Row
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
            |row| cell(row, col0), // Coordinate mapper for Col
            box_idx,
        );
        if !elims.is_empty() {
            return Some(build_pointing_step(cells, elims, num));
        }
    }
    None
}

/// Generic helper to collect eliminations for Pointing pairs.
/// Iterates every position using a coordinate mapper (to traverse row or col).
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
    for k in 0..SIZE {
        let idx = mapper(k);
        // Eliminate if cell is NOT in the source box
        if box_of(idx) != box_idx && board.cells[idx] == 0 && (board.candidates[idx] & mask) != 0 {
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
            Technique::PointingPair
        } else {
            Technique::PointingTriple
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
    for row in 0..SIZE {
        if let Some(step) = find_claiming_in_unit(board, row, true) {
            return Some(step);
        }
    }
    // Check Columns
    for col in 0..SIZE {
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
        &ROWS[unit_idx]
    } else {
        &COLS[unit_idx]
    };

    for num in 1..=MAX_DIGIT {
        let mask = 1 << (num - 1);
        let mut cells = Vec::new();
        let mut boxes = 0u16;

        // Find all cells in this line with the candidate
        for &idx in unit.iter() {
            if board.cells[idx] == 0 && (board.candidates[idx] & mask) != 0 {
                cells.push(idx);
                boxes |= 1 << box_of(idx);
            }
        }

        // If all candidates are in exactly one box, we can eliminate
        if boxes.count_ones() == 1 {
            let box_idx = boxes.trailing_zeros() as usize;
            let elims = collect_claiming_elims(board, box_idx, unit_idx, is_row, num, mask);

            if !elims.is_empty() {
                return Some(SolvingStep {
                    technique: Technique::ClaimingCandidate,
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
    for &idx in &BOXES[box_idx] {
        let line_match = if is_row {
            row_of(idx) == source_line_idx
        } else {
            col_of(idx) == source_line_idx
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
