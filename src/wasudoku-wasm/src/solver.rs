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
use crate::geometry::{
    ALL_DIGITS, CELLS, MAX_DIGIT, PEERS, SIZE, UNIT_COUNT, UNITS, box_of, col_of, row_of,
};

const ASCENDING: [u8; SIZE] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

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
pub fn solve_randomized(board: &mut Board, numbers: &[u8; SIZE]) -> bool {
    match Search::run(board, numbers, 1, Mode::Ordered, UNLIMITED) {
        Ok((_, Some(solution))) => {
            *board = solution;
            true
        }
        _ => false,
    }
}

/// Count the solutions of `board` up to two, with the first one found.
/// On a board with several solutions that first one is not the one `solve` returns.
pub fn count_with_solution(board: &Board) -> (u8, Option<Board>) {
    count_within(board, UNLIMITED).unwrap_or((0, None))
}

/// The guesses a search may make before it gives up.
pub type Budget = u32;

/// A budget above the guesses of the slowest known board, about 7.4 million.
const UNLIMITED: Budget = Budget::MAX;

/// The search ran out of its budget before it could answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SearchLimit;

/// `count_with_solution`, giving up after `budget` guesses.
pub fn count_within(board: &Board, budget: Budget) -> Result<(u8, Option<Board>), SearchLimit> {
    Search::run(board, &ASCENDING, 2, Mode::Counting, budget)
}

/// The solution `solve` finds, or `None` without one, giving up after `budget` guesses.
pub fn solve_within(board: &Board, budget: Budget) -> Result<Option<Board>, SearchLimit> {
    Search::run(board, &ASCENDING, 1, Mode::Ordered, budget).map(|(_, first)| first)
}

/// Count the number of solutions for a given board. Stops counting if more than 1 solution is found.
pub fn count_solutions(board: &Board) -> u8 {
    count_with_solution(board).0
}

/// Return the solution of `board` when it has exactly one, from the same single search as `count_solutions`.
pub fn unique_solution(board: &Board) -> Option<Board> {
    match count_with_solution(board) {
        (1, solution) => solution,
        _ => None,
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
    cells: [u8; CELLS],
    candidates: [u16; CELLS],
    placed: [u16; UNIT_COUNT],
    empty: u8,
}

/// Cells left with one candidate that still have to be placed.
struct Singles {
    cells: [u8; CELLS],
    len: usize,
}

impl Singles {
    fn new() -> Singles {
        Singles {
            cells: [0; CELLS],
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
            candidates: [0; CELLS],
            placed: [0; UNIT_COUNT],
            empty: 0,
        };
        for (i, &digit) in board.cells.iter().enumerate() {
            if digit > MAX_DIGIT || grid.seen(i) & bit(digit) != 0 {
                return None;
            }
            grid.mark(i, bit(digit));
        }
        let mut singles = Singles::new();
        for i in (0..CELLS).filter(|&i| board.cells[i] == 0) {
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
        self.placed[row] | self.placed[SIZE + col] | self.placed[2 * SIZE + bx]
    }

    fn mark(&mut self, i: usize, digit_bit: u16) {
        let (row, col, bx) = position(i);
        self.placed[row] |= digit_bit;
        self.placed[SIZE + col] |= digit_bit;
        self.placed[2 * SIZE + bx] |= digit_bit;
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
                    let mask = self.candidates[cell];
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
                    .copied()
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
    /// Counting mode takes a digit with fewer cells left in a unit instead, if there is one.
    fn branch(&self, mode: Mode) -> Option<Branch> {
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
                return Some(Branch::Cell(i));
            }
            best = Some((i, count));
        }
        best.map(|(cell, fewest)| match mode {
            Mode::Ordered => Branch::Cell(cell),
            Mode::Counting => self.unit_branch(fewest).unwrap_or(Branch::Cell(cell)),
        })
    }

    /// The first digit with the fewest cells left in a unit, if that is fewer than `fewest`.
    fn unit_branch(&self, fewest: u32) -> Option<Branch> {
        let mut best: Option<(usize, u16, u32)> = None;
        for (u, unit) in UNITS.iter().enumerate() {
            let mut missing = ALL_DIGITS & !self.placed[u];
            while missing != 0 {
                let digit_bit = missing.isolate_lowest_one();
                missing &= !digit_bit;
                let count = unit
                    .iter()
                    .filter(|&&c| self.candidates[c] & digit_bit != 0)
                    .count() as u32;
                // Counting mode places hidden singles, so two cannot be beaten either.
                if count == 2 {
                    return Some(Branch::Unit(u, digit_bit));
                }
                if count < best.map_or(fewest, |(_, _, n)| n) {
                    best = Some((u, digit_bit, count));
                }
            }
        }
        best.map(|(u, digit_bit, _)| Branch::Unit(u, digit_bit))
    }
}

/// The guess the search tries next: each candidate of a cell, or each cell left for a digit in a unit.
enum Branch {
    Cell(usize),
    Unit(usize, u16),
}

/// Depth-first search that copies the grid at each guess instead of undoing it.
struct Search<'a> {
    order: &'a [u8; SIZE],
    limit: u8,
    mode: Mode,
    found: u8,
    first: Option<Board>,
    budget: Budget,
    exhausted: bool,
}

impl<'a> Search<'a> {
    /// Search until `limit` solutions are found, a board with conflicts having none.
    fn run(
        board: &Board,
        order: &'a [u8; SIZE],
        limit: u8,
        mode: Mode,
        budget: Budget,
    ) -> Result<(u8, Option<Board>), SearchLimit> {
        let mut search = Search {
            order,
            limit,
            mode,
            found: 0,
            first: None,
            budget,
            exhausted: false,
        };
        if let Some(grid) = Grid::new(board, mode) {
            search.descend(&grid);
        }
        if search.exhausted {
            return Err(SearchLimit);
        }
        Ok((search.found, search.first))
    }

    fn descend(&mut self, grid: &Grid) {
        match grid.branch(self.mode) {
            None => {
                self.found += 1;
                if self.first.is_none() {
                    self.first = Some(Board { cells: grid.cells });
                }
            }
            Some(Branch::Cell(i)) => {
                let candidates = grid.candidates[i];
                for &digit in self.order {
                    if candidates & bit(digit) != 0 && self.guess(grid, i, digit) {
                        return;
                    }
                }
            }
            Some(Branch::Unit(u, digit_bit)) => {
                for &cell in &UNITS[u] {
                    if grid.candidates[cell] & digit_bit != 0
                        && self.guess(grid, cell, digit_of(digit_bit))
                    {
                        return;
                    }
                }
            }
        }
    }

    /// Search below `digit` placed in cell `i`, returning whether the limit or the budget is reached.
    fn guess(&mut self, grid: &Grid, i: usize, digit: u8) -> bool {
        if self.budget == 0 {
            self.exhausted = true;
            return true;
        }
        self.budget -= 1;
        let mut next = *grid;
        let mut singles = Singles::new();
        if next.place(i, digit, &mut singles) && next.propagate(self.mode, &mut singles) {
            self.descend(&next);
        }
        self.found >= self.limit
    }
}

fn position(i: usize) -> (usize, usize, usize) {
    (row_of(i), col_of(i), box_of(i))
}

/// The candidate bit of `digit`, with `0` mapping to no bit.
fn bit(digit: u8) -> u16 {
    (1u16 << digit) >> 1
}

fn digit_of(mask: u16) -> u8 {
    mask.trailing_zeros() as u8 + 1
}
