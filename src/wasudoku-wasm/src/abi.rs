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

//! The wire exports as a plain C ABI with no imports. The caller writes a board's 81 bytes at
//! `wire_input()`, calls an export, and copies the returned length of bytes from `wire_output()`.

use crate::geometry::CELLS;
use crate::{api, wire};
use std::cell::Cell;

thread_local! {
    static INPUT: Cell<[u8; CELLS]> = const { Cell::new([0; CELLS]) };
    static OUTPUT: Cell<Vec<u8>> = const { Cell::new(Vec::new()) };
}

/// Where the caller writes the 81 cell bytes of the next board.
#[unsafe(no_mangle)]
pub extern "C" fn wire_input() -> *mut u8 {
    INPUT.with(|input| input.as_ptr().cast())
}

/// Where the last result starts, valid until the next export runs.
#[unsafe(no_mangle)]
pub extern "C" fn wire_output() -> *const u8 {
    OUTPUT.with(|output| {
        let bytes = output.take();
        let start = bytes.as_ptr();
        output.set(bytes);
        start
    })
}

fn input() -> [u8; CELLS] {
    INPUT.with(Cell::get)
}

/// Keep `bytes` for `wire_output` and return their length.
fn respond(bytes: Vec<u8>) -> usize {
    let len = bytes.len();
    OUTPUT.with(|output| output.set(bytes));
    len
}

/// `api::solve` on the input board, returning the length of its result.
#[unsafe(no_mangle)]
pub extern "C" fn wire_solve() -> usize {
    respond(wire::solve(&api::solve(&input())))
}

/// `api::validate` on the input board, returning the length of its result.
#[unsafe(no_mangle)]
pub extern "C" fn wire_validate() -> usize {
    respond(wire::validate(&api::validate(&input())))
}

/// `api::next_step` on the input board, returning the length of its result.
#[unsafe(no_mangle)]
pub extern "C" fn wire_next_step() -> usize {
    respond(wire::hint(&api::next_step(&input())))
}

/// `api::generate` from a difficulty code and the two halves of a seed, returning the length of its result.
#[unsafe(no_mangle)]
pub extern "C" fn wire_generate(difficulty: u32, seed_low: u32, seed_high: u32) -> usize {
    let seed = u64::from(seed_high) << u32::BITS | u64::from(seed_low);
    let result = u8::try_from(difficulty)
        .map_err(|_| api::ApiError::BadDifficulty)
        .and_then(api::difficulty)
        .map(|difficulty| api::generate(difficulty, seed));
    respond(wire::generate(&result))
}
