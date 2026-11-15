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

//! Every API result as bytes, starting with `VERSION` and a `Tag` that sets the body after it.
//! `src/core/codec/wire.ts` decodes the same layout, and a golden test pins both ends.

use crate::api::{ApiError, Generated, Hint, Solved, Validation};
use crate::board::Board;
use crate::types::SolvingStep;

/// The layout version, the first byte of every result.
pub const VERSION: u8 = 1;

/// The kind of result, which sets the body after it. A board in a body is its 81 cell bytes.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tag {
    /// The `ApiError` code.
    Error = 0,
    /// The solution, a `u16` LE step count, then the steps.
    Solved = 1,
    /// The solution.
    Unique = 2,
    /// An empty body.
    Unsolvable = 3,
    /// An empty body.
    Several = 4,
    /// A list of cell indices.
    Conflict = 5,
    /// The difficulty code, the puzzle, then the solution.
    Generated = 6,
    /// One step.
    Step = 7,
    /// The solution.
    Stuck = 8,
}

/// The longest list one count byte describes.
const MAX_LIST: usize = u8::MAX as usize;

struct Writer(Vec<u8>);

impl Writer {
    fn new(tag: Tag) -> Self {
        Writer(vec![VERSION, tag as u8])
    }

    fn byte(&mut self, value: u8) {
        self.0.push(value);
    }

    fn board(&mut self, board: &Board) {
        self.0.extend_from_slice(&board.cells);
    }

    /// A count byte and up to `MAX_LIST` items, far above the longest list a step makes.
    fn list<T>(&mut self, items: &[T], mut item: impl FnMut(&mut Self, &T)) {
        let items = &items[..items.len().min(MAX_LIST)];
        self.byte(items.len() as u8);
        for value in items {
            item(self, value);
        }
    }

    fn cell(&mut self, index: usize) {
        self.byte(index as u8);
    }

    /// The technique code, then lists of placements, eliminations and causes.
    /// A cause is a cell and its candidates, in the order the finder emitted them.
    fn step(&mut self, step: &SolvingStep) {
        self.byte(step.technique as u8);
        self.list(&step.placements, |w, p| {
            w.cell(p.index);
            w.byte(p.value);
        });
        self.list(&step.eliminations, |w, e| {
            w.cell(e.index);
            w.byte(e.value);
        });
        self.list(&step.cause, |w, c| {
            w.cell(c.index);
            w.list(&c.candidates, |w, &d| w.byte(d));
        });
    }
}

/// A failed request.
pub fn error(error: ApiError) -> Vec<u8> {
    let mut w = Writer::new(Tag::Error);
    w.byte(error as u8);
    w.0
}

/// The result of `api::solve`.
pub fn solve(result: &Result<Solved, ApiError>) -> Vec<u8> {
    let solved = match result {
        Ok(solved) => solved,
        Err(e) => return error(*e),
    };
    let mut w = Writer::new(Tag::Solved);
    w.board(&solved.solution);
    let steps = u16::try_from(solved.steps.len()).unwrap_or(u16::MAX);
    w.0.extend_from_slice(&steps.to_le_bytes());
    for step in &solved.steps[..usize::from(steps)] {
        w.step(step);
    }
    w.0
}

/// The result of `api::validate`.
pub fn validate(result: &Result<Validation, ApiError>) -> Vec<u8> {
    match result {
        Ok(Validation::Unique(solution)) => {
            let mut w = Writer::new(Tag::Unique);
            w.board(solution);
            w.0
        }
        Ok(Validation::Unsolvable) => Writer::new(Tag::Unsolvable).0,
        Ok(Validation::Several) => Writer::new(Tag::Several).0,
        Ok(Validation::Conflict(cells)) => {
            let mut w = Writer::new(Tag::Conflict);
            w.list(cells, |w, &i| w.byte(i));
            w.0
        }
        Err(e) => error(*e),
    }
}

/// The result of `api::generate`.
pub fn generate(result: &Result<Generated, ApiError>) -> Vec<u8> {
    let generated = match result {
        Ok(generated) => generated,
        Err(e) => return error(*e),
    };
    let mut w = Writer::new(Tag::Generated);
    w.byte(generated.difficulty as u8);
    w.board(&generated.puzzle);
    w.board(&generated.solution);
    w.0
}

/// The result of `api::next_step`.
pub fn hint(result: &Result<Hint, ApiError>) -> Vec<u8> {
    match result {
        Ok(Hint::Step(step)) => {
            let mut w = Writer::new(Tag::Step);
            w.step(step);
            w.0
        }
        Ok(Hint::Stuck(solution)) => {
            let mut w = Writer::new(Tag::Stuck);
            w.board(solution);
            w.0
        }
        Err(e) => error(*e),
    }
}
