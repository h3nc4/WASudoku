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

/// A solving technique.
/// The wire format sends the declaration index, so a new technique goes last.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Technique {
    NakedSingle,
    HiddenSingle,
    NakedPair,
    NakedTriple,
    HiddenPair,
    HiddenTriple,
    PointingPair,
    PointingTriple,
    ClaimingCandidate,
    XWing,
    Swordfish,
    Jellyfish,
    XyWing,
    XyzWing,
    Skyscraper,
    TwoStringKite,
    UniqueRectangleType1,
    WWing,
}

impl Technique {
    /// Every technique, in declaration order, which is the order of their wire codes.
    pub const ALL: [Technique; 18] = [
        Self::NakedSingle,
        Self::HiddenSingle,
        Self::NakedPair,
        Self::NakedTriple,
        Self::HiddenPair,
        Self::HiddenTriple,
        Self::PointingPair,
        Self::PointingTriple,
        Self::ClaimingCandidate,
        Self::XWing,
        Self::Swordfish,
        Self::Jellyfish,
        Self::XyWing,
        Self::XyzWing,
        Self::Skyscraper,
        Self::TwoStringKite,
        Self::UniqueRectangleType1,
        Self::WWing,
    ];
}

/// A single logical step in solving the puzzle.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SolvingStep {
    /// The technique used.
    pub technique: Technique,
    /// A list of numbers placed on the board in this step.
    pub placements: Vec<Placement>,
    /// A list of candidates eliminated from cells in this step.
    pub eliminations: Vec<Elimination>,
    /// The cells that form the basis of the logical deduction.
    pub cause: Vec<CauseCell>,
}

/// A number placed in a cell.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Placement {
    pub index: usize,
    pub value: u8,
}

/// A candidate eliminated from a cell.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Elimination {
    pub index: usize,
    pub value: u8,
}

/// A cell that is part of the cause of a logical deduction.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CauseCell {
    pub index: usize,
    /// The candidates in this cell that are relevant to the deduction.
    /// For a Naked Pair of {1, 8}, this would be `vec![1, 8]`.
    pub candidates: Vec<u8>,
}
