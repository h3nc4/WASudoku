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

use crate::board::Board;

const ALL_DIGITS: u16 = 0x1FF;
const ASCENDING: [u8; 9] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/// Solve the Sudoku puzzle using a backtracking algorithm with an MRV heuristic.
///
/// ### Arguments
///
/// * `board` - A mutable reference to the `Board` to be solved in-place.
///
/// ### Returns
///
/// * `true` if a solution is found, `false` otherwise, leaving `board` unchanged.
pub fn solve(board: &mut Board) -> bool {
    solve_randomized(board, &ASCENDING)
}

/// Solve a Sudoku puzzle using backtracking, trying digits in the order given.
/// Used with a shuffled order to generate distinct solved boards.
pub fn solve_randomized(board: &mut Board, numbers: &[u8; 9]) -> bool {
    match Search::run(board, numbers, 1) {
        (_, Some(solution)) => {
            *board = solution;
            true
        }
        (_, None) => false,
    }
}

/// Count the number of solutions for a given board. Stops counting if more than 1 solution is found.
pub fn count_solutions(board: &Board) -> u8 {
    count_and_first_solution(board).0
}

/// Count solutions like `count_solutions`, also returning the first solution found.
pub fn count_and_first_solution(board: &Board) -> (u8, Option<Board>) {
    Search::run(board, &ASCENDING, 2)
}

/// Depth-first search over row, column and box masks of the digits already placed.
struct Search<'a> {
    cells: [u8; 81],
    rows: [u16; 9],
    cols: [u16; 9],
    boxes: [u16; 9],
    order: &'a [u8; 9],
    limit: u8,
    found: u8,
    first: Option<Board>,
}

impl<'a> Search<'a> {
    /// Search until `limit` solutions are found, a board with conflicts having none.
    fn run(board: &Board, order: &'a [u8; 9], limit: u8) -> (u8, Option<Board>) {
        let mut search = Search {
            cells: board.cells,
            rows: [0; 9],
            cols: [0; 9],
            boxes: [0; 9],
            order,
            limit,
            found: 0,
            first: None,
        };
        for (i, &digit) in board.cells.iter().enumerate() {
            if digit == 0 {
                continue;
            }
            let bit = match digit {
                1..=9 => 1 << (digit - 1),
                _ => return (0, None),
            };
            let (row, col, bx) = position(i);
            if (search.rows[row] | search.cols[col] | search.boxes[bx]) & bit != 0 {
                return (0, None);
            }
            search.toggle(row, col, bx, bit);
        }
        search.descend();
        (search.found, search.first)
    }

    fn toggle(&mut self, row: usize, col: usize, bx: usize, bit: u16) {
        self.rows[row] ^= bit;
        self.cols[col] ^= bit;
        self.boxes[bx] ^= bit;
    }

    fn candidates(&self, row: usize, col: usize, bx: usize) -> u16 {
        !(self.rows[row] | self.cols[col] | self.boxes[bx]) & ALL_DIGITS
    }

    fn descend(&mut self) {
        // Pick the empty cell with the fewest candidates, stopping early at one candidate.
        let mut best: Option<(usize, u16)> = None;
        for i in 0..81 {
            if self.cells[i] != 0 {
                continue;
            }
            let (row, col, bx) = position(i);
            let candidates = self.candidates(row, col, bx);
            let count = candidates.count_ones();
            if count == 0 {
                return;
            }
            if best.is_none_or(|(_, mask)| count < mask.count_ones()) {
                best = Some((i, candidates));
                if count == 1 {
                    break;
                }
            }
        }

        let Some((i, candidates)) = best else {
            self.found += 1;
            if self.first.is_none() {
                self.first = Some(Board { cells: self.cells });
            }
            return;
        };

        let (row, col, bx) = position(i);
        for &digit in self.order {
            let bit = 1 << (digit - 1);
            if candidates & bit == 0 {
                continue;
            }
            self.cells[i] = digit;
            self.toggle(row, col, bx, bit);
            self.descend();
            self.toggle(row, col, bx, bit);
            if self.found >= self.limit {
                break;
            }
        }
        self.cells[i] = 0;
    }
}

fn position(i: usize) -> (usize, usize, usize) {
    let (row, col) = (i / 9, i % 9);
    (row, col, (row / 3) * 3 + col / 3)
}
