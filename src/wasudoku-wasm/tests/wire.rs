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

use std::fmt::Write;
use std::fs;
use wasudoku_wasm::api::{self, ApiError, Generated, Hint, Solved, Validation};
use wasudoku_wasm::board::Board;
use wasudoku_wasm::generate::Difficulty;
use wasudoku_wasm::types::{CauseCell, Elimination, Placement, SolvingStep, Technique};
use wasudoku_wasm::wire::{self, Tag, VERSION};

const GOLDEN: &str = "tests/golden/wire.txt";
const TECHNIQUES: &str = "tests/golden/techniques.txt";

const PUZZLE: &str =
    "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";
// Its solve takes a W-Wing step whose cause candidates are not in ascending order.
const W_WING: &str =
    "48.3............71.2.......7.5....6....2..8.............1.76...3.....4......5....";
const NORVIG: &str =
    ".....5.8....6.1.43..........1.5........1.6...3.......553.....61........4.........";
const NEARLY_EMPTY: &str =
    "8................................................................................";
const SEED: u64 = 1;

fn cells(text: &str) -> Vec<u8> {
    text.bytes()
        .map(|b| if b == b'.' { 0 } else { b - b'0' })
        .collect()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().fold(String::new(), |mut s, b| {
        write!(s, "{b:02x}").unwrap();
        s
    })
}

/// Every case of the golden file, by name, encoded by today's API.
fn cases() -> Vec<(String, Vec<u8>)> {
    let mut cases = vec![
        ("solve".into(), wire::solve(&api::solve(&cells(PUZZLE)))),
        (
            "solve-w-wing".into(),
            wire::solve(&api::solve(&cells(W_WING))),
        ),
        (
            "solve-norvig".into(),
            wire::solve(&api::solve(&cells(NORVIG))),
        ),
        ("solve-bad-length".into(), wire::solve(&api::solve(&[0; 3]))),
        (
            "validate-unique".into(),
            wire::validate(&api::validate(&cells(PUZZLE))),
        ),
        (
            "validate-norvig".into(),
            wire::validate(&api::validate(&cells(NORVIG))),
        ),
        (
            "validate-several".into(),
            wire::validate(&api::validate(&cells(NEARLY_EMPTY))),
        ),
        (
            "validate-conflict".into(),
            wire::validate(&api::validate(&cells(&format!("88{}", &NEARLY_EMPTY[2..])))),
        ),
        (
            "validate-bad-digit".into(),
            wire::validate(&api::validate(&[10; 81])),
        ),
        (
            "hint-step".into(),
            wire::hint(&api::next_step(&cells(PUZZLE))),
        ),
        (
            "hint-stuck".into(),
            wire::hint(&api::next_step(&cells(NEARLY_EMPTY))),
        ),
        (
            "hint-norvig".into(),
            wire::hint(&api::next_step(&cells(NORVIG))),
        ),
        (
            "generate-bad-difficulty".into(),
            wire::generate(&api::difficulty(9).map(|d| api::generate(d, SEED))),
        ),
    ];
    for difficulty in Difficulty::ALL {
        let name = format!("generate-{difficulty:?}-seed-{SEED}").to_lowercase();
        cases.push((name, wire::generate(&Ok(api::generate(difficulty, SEED)))));
    }
    cases
}

fn render(cases: &[(String, Vec<u8>)]) -> String {
    cases
        .iter()
        .map(|(name, bytes)| format!("{name} {}\n", hex(bytes)))
        .collect()
}

#[test]
fn test_golden_file_matches_the_encoder() {
    let golden = fs::read_to_string(GOLDEN).unwrap();
    assert!(
        golden == render(&cases()),
        "the wire format changed, so bump wire::VERSION and rerun the ignored writer"
    );
}

// Run with `cargo test --test wire -- --ignored` after a deliberate format change.
#[test]
#[ignore]
fn write_golden_file() {
    fs::write(GOLDEN, render(&cases())).unwrap();
    fs::write(TECHNIQUES, render_techniques()).unwrap();
}

/// The id the app keys a technique on, its legacy serde name, which `web.rs` checks.
/// The match has no wildcard, so a new variant fails to compile until it is named here.
fn technique_id(technique: Technique) -> &'static str {
    match technique {
        Technique::NakedSingle => "NakedSingle",
        Technique::HiddenSingle => "HiddenSingle",
        Technique::NakedPair => "NakedPair",
        Technique::NakedTriple => "NakedTriple",
        Technique::HiddenPair => "HiddenPair",
        Technique::HiddenTriple => "HiddenTriple",
        Technique::PointingPair => "PointingPair",
        Technique::PointingTriple => "PointingTriple",
        Technique::ClaimingCandidate => "ClaimingCandidate",
        Technique::XWing => "X-Wing",
        Technique::Swordfish => "Swordfish",
        Technique::Jellyfish => "Jellyfish",
        Technique::XyWing => "XY-Wing",
        Technique::XyzWing => "XYZ-Wing",
        Technique::Skyscraper => "Skyscraper",
        Technique::TwoStringKite => "TwoStringKite",
        Technique::UniqueRectangleType1 => "UniqueRectangleType1",
        Technique::WWing => "W-Wing",
    }
}

/// Each technique's wire code beside its id, which `wire.test.ts` checks against its own table.
fn render_techniques() -> String {
    Technique::ALL
        .iter()
        .map(|&t| format!("{} {}\n", t as u8, technique_id(t)))
        .collect()
}

#[test]
fn test_technique_codes_match_the_golden_file() {
    let golden = fs::read_to_string(TECHNIQUES).unwrap();
    assert_eq!(
        golden,
        render_techniques(),
        "a technique code changed, so bump wire::VERSION and rerun the ignored writer"
    );
}

#[test]
fn test_every_technique_is_listed_at_its_code() {
    for (code, technique) in Technique::ALL.into_iter().enumerate() {
        assert_eq!(usize::from(technique as u8), code, "{technique:?}");
    }
}

fn step() -> SolvingStep {
    SolvingStep {
        technique: Technique::WWing,
        placements: vec![Placement {
            index: 80,
            value: 9,
        }],
        eliminations: vec![Elimination { index: 3, value: 4 }],
        cause: vec![CauseCell {
            index: 7,
            candidates: vec![9, 4],
        }],
    }
}

#[test]
fn test_a_step_keeps_the_order_of_its_cause_candidates() {
    let bytes = wire::hint(&Ok(Hint::Step(step())));
    let technique = Technique::WWing as u8;
    assert_eq!(
        bytes,
        [
            VERSION,
            Tag::Step as u8,
            technique,
            1,
            80,
            9,
            1,
            3,
            4,
            1,
            7,
            2,
            9,
            4
        ]
    );
}

#[test]
fn test_each_result_starts_with_the_version_and_its_tag() {
    let board = Board { cells: [1; 81] };
    let solved = Solved {
        steps: vec![step(), step()],
        solution: board,
    };
    let generated = Generated {
        puzzle: board,
        solution: board,
        difficulty: Difficulty::Hard,
    };
    let tagged = [
        (wire::solve(&Ok(solved)), Tag::Solved),
        (wire::validate(&Ok(Validation::Unique(board))), Tag::Unique),
        (wire::validate(&Ok(Validation::Unsolvable)), Tag::Unsolvable),
        (wire::validate(&Ok(Validation::Several)), Tag::Several),
        (
            wire::validate(&Ok(Validation::Conflict(vec![4, 5]))),
            Tag::Conflict,
        ),
        (wire::generate(&Ok(generated)), Tag::Generated),
        (wire::hint(&Ok(Hint::Stuck(board))), Tag::Stuck),
        (wire::error(ApiError::SearchLimit), Tag::Error),
    ];
    for (bytes, tag) in tagged {
        assert_eq!(bytes[..2], [VERSION, tag as u8], "{tag:?}");
    }
    let solved = wire::solve(&Ok(Solved {
        steps: vec![step(), step()],
        solution: board,
    }));
    assert_eq!(
        solved[2 + 81..2 + 81 + 2],
        [2, 0],
        "the step count is u16 LE"
    );
    let generated = wire::generate(&Ok(generated));
    assert_eq!(generated[2], Difficulty::Hard as u8);
    assert_eq!(generated.len(), 3 + 2 * 81);
    assert_eq!(
        wire::error(ApiError::SearchLimit),
        [VERSION, Tag::Error as u8, ApiError::SearchLimit as u8]
    );
}

#[test]
fn test_errors_travel_as_their_code() {
    let error = |e: ApiError| [VERSION, Tag::Error as u8, e as u8].to_vec();
    assert_eq!(
        wire::solve(&Err(ApiError::NoSolution)),
        error(ApiError::NoSolution)
    );
    assert_eq!(
        wire::validate(&Err(ApiError::BadDigit)),
        error(ApiError::BadDigit)
    );
    assert_eq!(
        wire::generate(&Err(ApiError::BadDifficulty)),
        error(ApiError::BadDifficulty)
    );
    assert_eq!(
        wire::hint(&Err(ApiError::Conflict)),
        error(ApiError::Conflict)
    );
}

#[test]
fn test_a_list_never_outgrows_its_count_byte() {
    let mut long = step();
    long.eliminations = (0..300)
        .map(|i| Elimination {
            index: i % 81,
            value: 1,
        })
        .collect();
    let bytes = wire::hint(&Ok(Hint::Step(long)));
    let eliminations = 2 + 1 + 1 + 2;
    assert_eq!(bytes[eliminations], u8::MAX);
    assert_eq!(bytes.len(), 2 + 1 + 3 + 1 + 2 * 255 + 1 + 4);
}

#[test]
fn test_a_solve_never_outgrows_its_step_count() {
    let solved = Solved {
        steps: vec![step(); usize::from(u16::MAX) + 1],
        solution: Board { cells: [1; 81] },
    };
    let bytes = wire::solve(&Ok(solved));
    assert_eq!(bytes[2 + 81..2 + 81 + 2], [0xff, 0xff]);
}
