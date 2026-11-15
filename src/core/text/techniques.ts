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

import { type CellIndex, digitsOf, EMPTY_MASK, type Mask, maskOf } from '../digits'
import type { Hint, Step, Technique } from '../game/steps'
import { boxOf, colOf, rowOf } from '../geometry'
import { formatCell } from './format'
import { EN } from './grammar'

/** The player's name of each technique. */
export const TECHNIQUE_NAMES: Readonly<Record<Technique, string>> = {
  NakedSingle: 'Naked Single',
  HiddenSingle: 'Hidden Single',
  NakedPair: 'Naked Pair',
  HiddenPair: 'Hidden Pair',
  NakedTriple: 'Naked Triple',
  HiddenTriple: 'Hidden Triple',
  PointingPair: 'Pointing Pair',
  PointingTriple: 'Pointing Triple',
  ClaimingCandidate: 'Box-Line Reduction',
  'X-Wing': 'X-Wing',
  Swordfish: 'Swordfish',
  Jellyfish: 'Jellyfish',
  'XY-Wing': 'XY-Wing',
  'XYZ-Wing': 'XYZ-Wing',
  'W-Wing': 'W-Wing',
  Skyscraper: 'Skyscraper',
  TwoStringKite: 'Two-String Kite',
  UniqueRectangleType1: 'Unique Rectangle Type 1',
  Backtracking: 'Backtracking',
}

export const techniqueName = (technique: Technique): string => TECHNIQUE_NAMES[technique]

/** The sentences of one technique, or null when the step lacks the cells they name. */
export type Explainer = (step: Step) => string | null

const listOr = (mask: Mask) => EN.or(digitsOf(mask).map(String))
const listAnd = (mask: Mask) => EN.and(digitsOf(mask).map(String))
const formatCells = (indices: readonly number[]) => EN.and(indices.map(formatCell))
const causeCells = (step: Step) => step.cause.map((cell) => cell.index)

/** Names the row or column shared by every cell, falling back to the row of the first. */
function describeLine(first: CellIndex, indices: readonly CellIndex[]): string {
  const sameCol = indices.every((index) => colOf(index) === colOf(first))
  const sameRow = indices.every((index) => rowOf(index) === rowOf(first))
  return sameCol && !sameRow
    ? `column ${String(colOf(first) + 1)}`
    : `row ${String(rowOf(first) + 1)}`
}

// Single-digit patterns print the lowest digit of their first cause. Every cause the solver
// emits for them contains only that digit, as the compat test checks over the corpus.
const patternDigit = (step: Step): number | undefined =>
  digitsOf(step.cause[0]?.candidates ?? EMPTY_MASK)[0]

const single =
  (sentence: (cell: string, digit: number) => string): Explainer =>
  ({ placements: [placed] }) =>
    placed ? sentence(formatCell(placed.index), placed.digit) : null

const nakedSubset: Explainer = (step) => {
  const [first] = step.cause
  return first
    ? `Cells ${formatCells(causeCells(step))} can only contain ${listOr(first.candidates)}. So ${listAnd(first.candidates)} are removed from the other cells in the same unit.`
    : null
}

const hiddenSubset: Explainer = (step) => {
  const [first] = step.cause
  return first
    ? `In their shared unit, ${listAnd(first.candidates)} only appear in cells ${formatCells(causeCells(step))}. So every other candidate is removed from these cells.`
    : null
}

/** A pattern of one digit inside a box and a line, both read off the first cause cell. */
const boxLine =
  (sentence: (digit: string, cells: string, line: string, box: string) => string): Explainer =>
  (step) => {
    const digit = patternDigit(step)
    const [first] = step.cause
    if (digit === undefined || !first) return null
    const cells = causeCells(step)
    const box = String(boxOf(first.index) + 1)
    return sentence(String(digit), formatCells(cells), describeLine(first.index, cells), box)
  }

const pointing = boxLine(
  (digit, cells, line, box) =>
    `In box ${box}, the candidate ${digit} only appears in ${cells}, which lie in ${line}. So ${digit} is removed from the rest of ${line}.`,
)

const fish =
  (sentence: (digit: string, cells: string) => string): Explainer =>
  (step) => {
    const digit = patternDigit(step)
    return digit === undefined ? null : sentence(String(digit), formatCells(causeCells(step)))
  }

/** A pivot and two pincers, the cause cells in that order, and the digit they strike. */
const wing =
  (sentence: (pivot: string, a: string, b: string, digit: string) => string): Explainer =>
  (step) => {
    const [pivot, a, b] = causeCells(step).map(formatCell)
    const [struck] = step.eliminations
    return pivot && a && b && struck ? sentence(pivot, a, b, String(struck.digit)) : null
  }

const uniqueRectangle: Explainer = (step) => {
  const [first] = step.cause
  const [struck] = step.eliminations
  if (!first || !struck) return null
  const digits = listAnd(first.candidates)
  return `A "deadly pattern" of ${digits} spans two boxes. To avoid a puzzle with several solutions, ${digits} must be removed from cell ${formatCell(struck.index)}, which holds extra possibilities.`
}

// The pair's other digit is whichever is not struck, and the pair prints in ascending order.
const wWing: Explainer = (step) => {
  const [struck] = step.eliminations
  if (!struck) return null
  const x = struck.digit
  const b = digitsOf(step.cause[0]?.candidates ?? EMPTY_MASK).find((digit) => digit !== x)
  const pair = listAnd(maskOf(b === undefined ? [x] : [x, b]))
  const link = b === undefined ? 'A strong link' : `A strong link on ${String(b)}`
  return `Two cells hold only ${pair} but do not see each other. ${link} connects them, which forces one of the two cells to be ${String(x)}. So ${String(x)} is removed from any cell that sees both.`
}

export const EXPLAINERS: Readonly<Record<Technique, Explainer>> = {
  NakedSingle: single(
    (cell, digit) => `Cell ${cell} has only one possible candidate left, ${String(digit)}.`,
  ),
  HiddenSingle: single(
    (cell, digit) =>
      `Within its row, column or box, the number ${String(digit)} fits only in cell ${cell}.`,
  ),
  NakedPair: nakedSubset,
  NakedTriple: nakedSubset,
  HiddenPair: hiddenSubset,
  HiddenTriple: hiddenSubset,
  PointingPair: pointing,
  PointingTriple: pointing,
  ClaimingCandidate: boxLine(
    (digit, cells, line, box) =>
      `In ${line}, the candidate ${digit} only appears in ${cells}, which lie in box ${box}. So ${digit} is removed from the rest of that box.`,
  ),
  'X-Wing': fish(
    (digit, cells) =>
      `The candidate ${digit} appears in only two positions in two rows (or columns), and these positions share the same columns (or rows). This forms a rectangle at ${cells}, eliminating ${digit} from the rest of the covering columns (or rows).`,
  ),
  Swordfish: fish(
    (digit) =>
      `The candidate ${digit} appears in only two or three positions in three rows (or columns), and these positions align within three columns (or rows). This eliminates ${digit} from other cells in those covering lines.`,
  ),
  Jellyfish: fish(
    (digit) =>
      `The candidate ${digit} appears in positions across four rows (or columns) that align within four columns (or rows). This eliminates ${digit} from the rest of the covering lines.`,
  ),
  'XY-Wing': wing(
    (pivot, a, b, digit) =>
      `Pivot ${pivot} and pincers ${a} and ${b} form a Y-Wing pattern. Whatever value the pivot takes, one of the pincers must be ${digit}. So ${digit} can be removed from any cell seen by both pincers.`,
  ),
  'XYZ-Wing': wing(
    (pivot, a, b, digit) =>
      `Pivot ${pivot} and pincers ${a} and ${b} form a bent triple. The pivot has 3 candidates and the pincers have 2, with ${digit} common to all three. Any cell seeing all three can no longer be ${digit}.`,
  ),
  Skyscraper: fish(
    (digit) =>
      `Two rows (or columns) have the candidate ${digit} in only two positions. One end of each line aligns in the same column (or row). The other two ends, the "roof", eliminate ${digit} from any cell that sees both of them.`,
  ),
  TwoStringKite: fish(
    (digit) =>
      `A row and a column each have exactly two positions for candidate ${digit}. One end of the row and one end of the column meet inside the same box. So ${digit} must be in one of the outer ends, eliminating it from their intersection.`,
  ),
  UniqueRectangleType1: uniqueRectangle,
  'W-Wing': wWing,
  Backtracking: () =>
    'The available logical techniques were not enough to solve the puzzle. A backtracking (brute-force) search found the solution.',
}

/** Explains a step in plain sentences, or names its technique when the step lacks its cells. */
export const explainStep = (step: Step): string =>
  EXPLAINERS[step.technique](step) ?? `${techniqueName(step.technique)}.`

/** Explains a hint without revealing more than the hint itself. */
export function explainHint(hint: Hint): string {
  switch (hint.kind) {
    case 'mistake':
      return `Cell ${formatCell(hint.index)} does not match the solution. Erase it before looking further.`
    case 'reveal':
      return `No logical technique applies here. Cell ${formatCell(hint.index)} is ${String(hint.digit)}.`
    case 'step':
      return explainStep(hint.step)
  }
}

/** Where a step acts on the board, with its technique's name, for one line of the trace. */
export interface TraceText {
  readonly where: string
  readonly label: string
}

// Points at the placement, else the pattern cells, else what the step strikes.
// `withValue` is false for hints, which leave the digit to the explanation.
export function traceText(step: Step, withValue = true): TraceText {
  const { placements, cause, eliminations } = step
  let cells: readonly number[] = eliminations.map((cell) => cell.index)
  if (placements.length > 0) cells = placements.map((cell) => cell.index)
  else if (cause.length > 0) cells = causeCells(step)
  const [head] = cells
  let where = head === undefined ? '' : formatCell(head)
  if (cells.length > 1) where += ` +${String(cells.length - 1)}`
  const [placed] = placements
  if (withValue && placements.length === 1 && placed) where += ` = ${String(placed.digit)}`
  return { where, label: techniqueName(step.technique) }
}

export const WALKTHROUGH_START =
  'The puzzle as given. Step forward to replay each deduction on the board.'

/** The explanation beside the board at a walkthrough position, 0 being the puzzle as given. */
export function explainPosition(steps: readonly Step[], position: number): string {
  const step = position > 0 ? steps[position - 1] : undefined
  return step ? explainStep(step) : WALKTHROUGH_START
}

export const solvedInText = (count: number): string =>
  `Solved in ${String(count)} ${EN.plural(count) === 'one' ? 'step' : 'steps'}`
