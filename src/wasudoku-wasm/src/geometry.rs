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

//! The one place that knows a board is 9 by 9, as constants and tables built at compile time.

/// The side of a box, in cells.
pub const BOX: usize = 3;
/// The side of the board, which is also the number of cells in a unit and of digits.
pub const SIZE: usize = BOX * BOX;
/// The cells on the board.
pub const CELLS: usize = SIZE * SIZE;
/// The 9 rows, 9 columns and 9 boxes.
pub const UNIT_COUNT: usize = 3 * SIZE;
/// The cells sharing a row, column or box with a cell.
pub const PEER_COUNT: usize = 3 * (SIZE - 1) - 2 * (BOX - 1);
/// The highest digit on the board.
pub const MAX_DIGIT: u8 = SIZE as u8;
/// A candidate mask of every digit, bit `d - 1` standing for digit `d`.
pub const ALL_DIGITS: u16 = (1 << SIZE) - 1;
/// A cell mask of every cell, bit `i` standing for cell `i`.
pub const ALL_CELLS: u128 = (1 << CELLS) - 1;

/// The row of cell `i`.
pub const fn row_of(i: usize) -> usize {
    i / SIZE
}

/// The column of cell `i`.
pub const fn col_of(i: usize) -> usize {
    i % SIZE
}

/// The box of cell `i`, numbered left to right and top to bottom.
pub const fn box_of(i: usize) -> usize {
    (row_of(i) / BOX) * BOX + col_of(i) / BOX
}

/// The cell at `row` and `col`.
pub const fn cell(row: usize, col: usize) -> usize {
    row * SIZE + col
}

/// The `k`-th cell of box `bx`, in reading order.
pub const fn box_cell(bx: usize, k: usize) -> usize {
    cell((bx / BOX) * BOX + k / BOX, (bx % BOX) * BOX + k % BOX)
}

/// Whether cell `i` lies on the board.
pub const fn is_cell(i: usize) -> bool {
    i < CELLS
}

/// The cells of each row, in column order.
pub static ROWS: [[usize; SIZE]; SIZE] = units_of(0);
/// The cells of each column, in row order.
pub static COLS: [[usize; SIZE]; SIZE] = units_of(SIZE);
/// The cells of each box, in reading order.
pub static BOXES: [[usize; SIZE]; SIZE] = units_of(2 * SIZE);
/// The cells of the 9 rows, then the 9 columns, then the 9 boxes.
pub static UNITS: [[usize; SIZE]; UNIT_COUNT] = all_units();
/// An 81-bit mask of the peers of each cell.
pub static PEER_MASKS: [u128; CELLS] = peer_masks();
/// The peers of each cell, in ascending order.
pub static PEERS: [[u8; PEER_COUNT]; CELLS] = peer_lists();

/// Unit `u` in the order of `UNITS`.
const fn unit(u: usize) -> [usize; SIZE] {
    let mut cells = [0; SIZE];
    let mut k = 0;
    while k < SIZE {
        let n = u % SIZE;
        cells[k] = match u / SIZE {
            0 => cell(n, k),
            1 => cell(k, n),
            _ => box_cell(n, k),
        };
        k += 1;
    }
    cells
}

const fn units_of(first: usize) -> [[usize; SIZE]; SIZE] {
    let mut units = [[0; SIZE]; SIZE];
    let mut n = 0;
    while n < SIZE {
        units[n] = unit(first + n);
        n += 1;
    }
    units
}

const fn all_units() -> [[usize; SIZE]; UNIT_COUNT] {
    let mut units = [[0; SIZE]; UNIT_COUNT];
    let mut u = 0;
    while u < UNIT_COUNT {
        units[u] = unit(u);
        u += 1;
    }
    units
}

const fn sees(a: usize, b: usize) -> bool {
    a != b && (row_of(a) == row_of(b) || col_of(a) == col_of(b) || box_of(a) == box_of(b))
}

const fn peer_masks() -> [u128; CELLS] {
    let mut masks = [0; CELLS];
    let mut i = 0;
    while i < CELLS {
        let mut j = 0;
        while j < CELLS {
            if sees(i, j) {
                masks[i] |= 1 << j;
            }
            j += 1;
        }
        i += 1;
    }
    masks
}

const fn peer_lists() -> [[u8; PEER_COUNT]; CELLS] {
    let mut peers = [[0; PEER_COUNT]; CELLS];
    let mut i = 0;
    while i < CELLS {
        let (mut j, mut n) = (0, 0);
        while j < CELLS {
            if sees(i, j) {
                peers[i][n] = j as u8;
                n += 1;
            }
            j += 1;
        }
        i += 1;
    }
    peers
}

#[cfg(test)]
mod tests {
    use super::*;

    // The tables are built at compile time, so these calls are what runs their builders.
    #[test]
    fn test_builders_match_the_tables() {
        assert_eq!(units_of(0), ROWS);
        assert_eq!(units_of(SIZE), COLS);
        assert_eq!(units_of(2 * SIZE), BOXES);
        assert_eq!(all_units(), UNITS);
        assert_eq!(peer_masks(), PEER_MASKS);
        assert_eq!(peer_lists(), PEERS);
    }

    #[test]
    fn test_every_cell_sits_in_one_row_column_and_box() {
        for i in 0..CELLS {
            assert_eq!(ROWS[row_of(i)][col_of(i)], i);
            assert_eq!(COLS[col_of(i)][row_of(i)], i);
            assert!(BOXES[box_of(i)].contains(&i));
            assert_eq!(cell(row_of(i), col_of(i)), i);
            assert!(is_cell(i));
            assert_eq!(PEER_MASKS[i].count_ones() as usize, PEER_COUNT);
            assert_eq!(PEER_MASKS[i] & ALL_CELLS, PEER_MASKS[i]);
            let listed = PEERS[i].iter().fold(0u128, |m, &p| m | 1 << p);
            assert_eq!(listed, PEER_MASKS[i]);
        }
        assert!(!is_cell(CELLS));
    }

    #[test]
    fn test_known_geometry() {
        assert_eq!(BOXES[4], [30, 31, 32, 39, 40, 41, 48, 49, 50]);
        assert_eq!(box_cell(8, 8), CELLS - 1);
        assert_eq!(PEERS[0][..8], [1, 2, 3, 4, 5, 6, 7, 8]);
        assert_eq!(ALL_DIGITS.count_ones() as usize, SIZE);
        assert_eq!(usize::from(MAX_DIGIT), SIZE);
    }
}
