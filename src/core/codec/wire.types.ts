/*
 * Copyright (C) 2026  Henrique Almeida
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

/** A solving technique, by the id the step explanations key on. */
export type Technique =
  | 'NakedSingle'
  | 'HiddenSingle'
  | 'NakedPair'
  | 'NakedTriple'
  | 'HiddenPair'
  | 'HiddenTriple'
  | 'PointingPair'
  | 'PointingTriple'
  | 'ClaimingCandidate'
  | 'X-Wing'
  | 'Swordfish'
  | 'Jellyfish'
  | 'XY-Wing'
  | 'XYZ-Wing'
  | 'Skyscraper'
  | 'TwoStringKite'
  | 'UniqueRectangleType1'
  | 'W-Wing'

/** Every technique, at the index of its wire code, as `tests/golden/techniques.txt` pins it from Rust. */
export const TECHNIQUES: readonly Technique[] = [
  'NakedSingle',
  'HiddenSingle',
  'NakedPair',
  'NakedTriple',
  'HiddenPair',
  'HiddenTriple',
  'PointingPair',
  'PointingTriple',
  'ClaimingCandidate',
  'X-Wing',
  'Swordfish',
  'Jellyfish',
  'XY-Wing',
  'XYZ-Wing',
  'Skyscraper',
  'TwoStringKite',
  'UniqueRectangleType1',
  'W-Wing',
]

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'extreme'

/** Every difficulty, at the index of its wire code. */
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'extreme']

/** Why the solver refused a request. */
export type ApiError =
  'badLength' | 'badDigit' | 'conflict' | 'noSolution' | 'searchLimit' | 'badDifficulty'

/** Every API error, at the index of its wire code minus one. */
export const API_ERRORS: readonly ApiError[] = [
  'badLength',
  'badDigit',
  'conflict',
  'noSolution',
  'searchLimit',
  'badDifficulty',
]

/** A digit placed in a cell, or a candidate removed from one. */
export interface CellDigit {
  readonly index: number
  readonly value: number
}

/** A cell behind a deduction, with its candidates in the order the solver gave them. */
export interface Cause {
  readonly index: number
  readonly candidates: readonly number[]
}

export interface Step {
  readonly technique: Technique
  readonly placements: readonly CellDigit[]
  readonly eliminations: readonly CellDigit[]
  readonly cause: readonly Cause[]
}

/** A board as 81 cell bytes in reading order, 0 for an empty cell. */
export type Cells = Uint8Array

export interface Failed {
  readonly kind: 'error'
  readonly error: ApiError
}

export type SolveResult =
  { readonly kind: 'solved'; readonly steps: readonly Step[]; readonly solution: Cells } | Failed

export type ValidateResult =
  | { readonly kind: 'unique'; readonly solution: Cells }
  | { readonly kind: 'unsolvable' }
  | { readonly kind: 'several' }
  | { readonly kind: 'conflict'; readonly cells: readonly number[] }
  | Failed

export type GenerateResult =
  | {
      readonly kind: 'generated'
      readonly difficulty: Difficulty
      readonly puzzle: Cells
      readonly solution: Cells
    }
  | Failed

export type HintResult =
  | { readonly kind: 'step'; readonly step: Step }
  | { readonly kind: 'stuck'; readonly solution: Cells }
  | Failed

/** Why bytes fail to decode, such as a layout version this decoder does not read. */
export type WireError = 'version' | 'tag' | 'truncated' | 'trailing' | 'range'

export type Decoded<T> =
  { readonly ok: true; readonly result: T } | { readonly ok: false; readonly error: WireError }
