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

lazy_static::lazy_static! {
    /// The cells of the 9 rows, then the 9 columns, then the 9 boxes.
    static ref UNITS: [[u8; 9]; 27] = {
        let mut units = [[0; 9]; 27];
        for i in 0..81 {
            let (row, col, bx) = position(i);
            units[row][col] = i as u8;
            units[9 + col][row] = i as u8;
            units[18 + bx][(row % 3) * 3 + col % 3] = i as u8;
        }
        units
    };
    /// The 20 cells sharing a row, column or box with each cell.
    static ref PEERS: [[u8; 20]; 81] = {
        let mut peers = [[0; 20]; 81];
        for (i, cell_peers) in peers.iter_mut().enumerate() {
            let (row, col, bx) = position(i);
            let shares_unit = |j: usize| {
                let (r, c, b) = position(j);
                j != i && (r == row || c == col || b == bx)
            };
            for (slot, j) in cell_peers.iter_mut().zip((0..81).filter(|&j| shares_unit(j))) {
                *slot = j as u8;
            }
        }
        peers
    };
}

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
    match Search::run(board, numbers, 1, Mode::Ordered) {
        (_, Some(solution)) => {
            *board = solution;
            true
        }
        (_, None) => false,
    }
}

/// Count the number of solutions for a given board. Stops counting if more than 1 solution is found.
pub fn count_solutions(board: &Board) -> u8 {
    Search::run(board, &ASCENDING, 2, Mode::Counting).0
}

/// Count solutions like `count_solutions`, also returning the first solution found.
pub fn count_and_first_solution(board: &Board) -> (u8, Option<Board>) {
    match Search::run(board, &ASCENDING, 2, Mode::Counting) {
        // Counting mode reaches solutions in another order.
        // Searching again in order finds the one a plain MRV search reaches first.
        (2, _) => (2, Search::run(board, &ASCENDING, 1, Mode::Ordered).1),
        result => result,
    }
}

/// How the search propagates between guesses.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode {
    /// Naked singles only, so the guesses and the first solution match a plain MRV search.
    Ordered,
    /// Naked and hidden singles, for when only the number of solutions matters.
    Counting,
}

/// A partial assignment with the remaining candidates of every empty cell.
/// A filled cell has an empty candidate mask, and an empty cell with an empty mask is a contradiction.
#[derive(Clone, Copy)]
struct Grid {
    cells: [u8; 81],
    candidates: [u16; 81],
    placed: [u16; 27],
    empty: u8,
}

/// Cells left with one candidate that still have to be placed.
struct Singles {
    cells: [u8; 81],
    len: usize,
}

impl Singles {
    fn new() -> Singles {
        Singles {
            cells: [0; 81],
            len: 0,
        }
    }

    fn push(&mut self, cell: usize) {
        self.cells[self.len] = cell as u8;
        self.len += 1;
    }

    fn pop(&mut self) -> Option<usize> {
        self.len = self.len.checked_sub(1)?;
        Some(self.cells[self.len] as usize)
    }
}

impl Grid {
    /// Build the candidates left by the clues of `board`, or `None` once it is shown to have no solution.
    fn new(board: &Board, mode: Mode) -> Option<Grid> {
        let mut grid = Grid {
            cells: board.cells,
            candidates: [0; 81],
            placed: [0; 27],
            empty: 0,
        };
        for (i, &digit) in board.cells.iter().enumerate() {
            if digit > 9 || grid.seen(i) & bit(digit) != 0 {
                return None;
            }
            grid.mark(i, bit(digit));
        }
        let mut singles = Singles::new();
        for i in (0..81).filter(|&i| board.cells[i] == 0) {
            let mask = !grid.seen(i) & ALL_DIGITS;
            if mask == 0 {
                return None;
            }
            grid.candidates[i] = mask;
            grid.empty += 1;
            if mask & (mask - 1) == 0 {
                singles.push(i);
            }
        }
        grid.propagate(mode, &mut singles).then_some(grid)
    }

    /// The digits already placed in the row, column and box of cell `i`.
    fn seen(&self, i: usize) -> u16 {
        let (row, col, bx) = position(i);
        self.placed[row] | self.placed[9 + col] | self.placed[18 + bx]
    }

    fn mark(&mut self, i: usize, digit_bit: u16) {
        let (row, col, bx) = position(i);
        self.placed[row] |= digit_bit;
        self.placed[9 + col] |= digit_bit;
        self.placed[18 + bx] |= digit_bit;
    }

    /// Place `digit` in cell `i` and remove it from the peers, queueing those left with one candidate.
    /// Returns `false` if a peer is left with none.
    fn place(&mut self, i: usize, digit: u8, singles: &mut Singles) -> bool {
        let digit_bit = bit(digit);
        self.cells[i] = digit;
        self.candidates[i] = 0;
        self.empty -= 1;
        self.mark(i, digit_bit);
        for &peer in &PEERS[i] {
            let peer = peer as usize;
            let mask = self.candidates[peer];
            if mask & digit_bit == 0 {
                continue;
            }
            let mask = mask & !digit_bit;
            self.candidates[peer] = mask;
            if mask == 0 {
                return false;
            }
            if mask & (mask - 1) == 0 {
                singles.push(peer);
            }
        }
        true
    }

    /// Place every forced digit, returning `false` on a contradiction.
    fn propagate(&mut self, mode: Mode, singles: &mut Singles) -> bool {
        loop {
            while let Some(i) = singles.pop() {
                let mask = self.candidates[i];
                // A queued cell may already be filled by a hidden single.
                if mask != 0 && !self.place(i, digit_of(mask), singles) {
                    return false;
                }
            }
            if mode == Mode::Ordered || self.empty == 0 {
                return true;
            }
            match self.place_hidden_singles(singles) {
                Some(true) => continue,
                Some(false) => return true,
                None => return false,
            }
        }
    }

    /// Place every digit that fits one cell of its unit.
    /// Returns whether any was placed, or `None` on a contradiction.
    fn place_hidden_singles(&mut self, singles: &mut Singles) -> Option<bool> {
        let mut placed = false;
        for (u, unit) in UNITS.iter().enumerate() {
            loop {
                let (mut once, mut twice) = (0u16, 0u16);
                for &cell in unit {
                    let mask = self.candidates[cell as usize];
                    twice |= once & mask;
                    once |= mask;
                }
                if once | self.placed[u] != ALL_DIGITS {
                    return None;
                }
                let hidden = once & !twice;
                if hidden == 0 {
                    break;
                }
                let digit_bit = hidden.isolate_lowest_one();
                let cell = unit
                    .iter()
                    .map(|&c| c as usize)
                    .find(|&c| self.candidates[c] & digit_bit != 0)?;
                if !self.place(cell, digit_of(digit_bit), singles) {
                    return None;
                }
                placed = true;
            }
        }
        Some(placed)
    }

    /// The first empty cell with the fewest candidates, or `None` if the grid is full.
    fn branch_cell(&self) -> Option<usize> {
        if self.empty == 0 {
            return None;
        }
        let mut best: Option<(usize, u32)> = None;
        for (i, mask) in self.candidates.iter().enumerate() {
            let count = mask.count_ones();
            if count == 0 || best.is_some_and(|(_, fewest)| fewest <= count) {
                continue;
            }
            // After propagation no empty cell has one candidate, so two cannot be beaten.
            if count == 2 {
                return Some(i);
            }
            best = Some((i, count));
        }
        best.map(|(i, _)| i)
    }
}

/// Depth-first search that copies the grid at each guess instead of undoing it.
struct Search<'a> {
    order: &'a [u8; 9],
    limit: u8,
    mode: Mode,
    found: u8,
    first: Option<Board>,
}

impl<'a> Search<'a> {
    /// Search until `limit` solutions are found, a board with conflicts having none.
    fn run(board: &Board, order: &'a [u8; 9], limit: u8, mode: Mode) -> (u8, Option<Board>) {
        let mut search = Search {
            order,
            limit,
            mode,
            found: 0,
            first: None,
        };
        if let Some(grid) = Grid::new(board, mode) {
            search.descend(&grid);
        }
        (search.found, search.first)
    }

    fn descend(&mut self, grid: &Grid) {
        let Some(i) = grid.branch_cell() else {
            self.found += 1;
            if self.first.is_none() {
                self.first = Some(Board { cells: grid.cells });
            }
            return;
        };
        let candidates = grid.candidates[i];
        for &digit in self.order {
            if candidates & bit(digit) == 0 {
                continue;
            }
            let mut next = *grid;
            let mut singles = Singles::new();
            if next.place(i, digit, &mut singles) && next.propagate(self.mode, &mut singles) {
                self.descend(&next);
                if self.found >= self.limit {
                    return;
                }
            }
        }
    }
}

fn position(i: usize) -> (usize, usize, usize) {
    let (row, col) = (i / 9, i % 9);
    (row, col, (row / 3) * 3 + col / 3)
}

/// The candidate bit of `digit`, with `0` mapping to no bit.
fn bit(digit: u8) -> u16 {
    (1u16 << digit) >> 1
}

fn digit_of(mask: u16) -> u8 {
    mask.trailing_zeros() as u8 + 1
}
