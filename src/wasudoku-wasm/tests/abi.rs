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

use wasudoku_wasm::abi::{
    wire_generate, wire_input, wire_next_step, wire_output, wire_solve, wire_validate,
};
use wasudoku_wasm::api::{self, ApiError};
use wasudoku_wasm::generate::Difficulty;
use wasudoku_wasm::wire;

const PUZZLE: &str =
    "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";

/// Write a board into the input buffer, as the JS glue does.
fn put(text: &str) {
    let bytes: Vec<u8> = text
        .bytes()
        .map(|b| if b == b'.' { 0 } else { b - b'0' })
        .collect();
    // SAFETY: the buffer is 81 bytes long and nothing else touches it during the copy.
    unsafe { std::ptr::copy_nonoverlapping(bytes.as_ptr(), wire_input(), bytes.len()) };
}

/// Read the `len` bytes of the last result, as the JS glue does.
fn take(len: usize) -> Vec<u8> {
    // SAFETY: the export just stored `len` bytes at `wire_output()`.
    unsafe { std::slice::from_raw_parts(wire_output(), len) }.to_vec()
}

#[test]
fn test_each_export_returns_what_the_api_encodes() {
    let cells = api::parse(
        &PUZZLE
            .bytes()
            .map(|b| if b == b'.' { 0 } else { b - b'0' })
            .collect::<Vec<_>>(),
    )
    .unwrap()
    .cells;
    put(PUZZLE);
    assert_eq!(take(wire_solve()), wire::solve(&api::solve(&cells)));
    assert_eq!(
        take(wire_validate()),
        wire::validate(&api::validate(&cells))
    );
    assert_eq!(take(wire_next_step()), wire::hint(&api::next_step(&cells)));
}

#[test]
fn test_generate_joins_the_two_seed_halves() {
    let seed = (3u64 << 32) | 5;
    let expected = wire::generate(&Ok(api::generate(Difficulty::Medium, seed)));
    assert_eq!(
        take(wire_generate(Difficulty::Medium as u32, 5, 3)),
        expected
    );
}

#[test]
fn test_generate_rejects_an_unknown_difficulty() {
    let rejected = wire::error(ApiError::BadDifficulty);
    assert_eq!(take(wire_generate(5, 0, 0)), rejected);
    assert_eq!(take(wire_generate(u32::from(u8::MAX) + 1, 0, 0)), rejected);
}

#[test]
fn test_the_output_stays_put_until_the_next_call() {
    put(PUZZLE);
    let len = wire_validate();
    assert_eq!(wire_output(), wire_output());
    assert_eq!(take(len), take(len));
}
