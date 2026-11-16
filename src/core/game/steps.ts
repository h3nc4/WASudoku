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

import type { Board } from '../board'
import type { CellIndex, Digit } from '../digits'

/** Technique ids the solver reports, plus the one appended when logic runs out. */
export const TECHNIQUES = [
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
  'Backtracking',
] as const
export type Technique = (typeof TECHNIQUES)[number]

const TECHNIQUE_NAMES: readonly unknown[] = TECHNIQUES

export const isTechnique = (value: unknown): value is Technique => TECHNIQUE_NAMES.includes(value)

/** A digit a step writes into a cell, or one it strikes from the cell's candidates. */
export interface CellDigit {
  readonly index: CellIndex
  readonly digit: Digit
}

/** A cell of the pattern behind a step, with the candidates that form it. */
export interface CauseCell {
  readonly index: CellIndex
  readonly candidates: number
}

/** One deduction of the logical solver. */
export interface Step {
  readonly technique: Technique
  readonly placements: readonly CellDigit[]
  readonly eliminations: readonly CellDigit[]
  readonly cause: readonly CauseCell[]
}

/** The logical steps of a solve in order, with the full solution. */
export interface SolveResult {
  readonly steps: readonly Step[]
  readonly solution: Board
}

/** The step a walkthrough appends when logic stopped short of the solution. */
export const BACKTRACKING_STEP: Step = {
  technique: 'Backtracking',
  placements: [],
  eliminations: [],
  cause: [],
}

/** A hint for the next move on the player's board. */
export type Hint =
  | { readonly kind: 'step'; readonly step: Step }
  | { readonly kind: 'mistake'; readonly index: CellIndex }
  | { readonly kind: 'reveal'; readonly index: CellIndex; readonly digit: Digit }
