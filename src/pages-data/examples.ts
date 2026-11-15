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

import type { CellView } from '../components-next/view'
import { type Board, isBoardFull, isGiven, parseBoard, place, valueAt } from '../core/board'
import {
  type CellIndex,
  type Digit,
  digitsOf,
  EMPTY_MASK,
  type Mask,
  withDigit,
} from '../core/digits'
import type { CellDigit, Step, Technique } from '../core/game/steps'
import { walkCandidates } from '../core/game/walkthrough'
import { CELLS, lookup } from '../core/geometry'
import { formatCell } from '../core/text/format'
import { EN } from '../core/text/grammar'
import { explainStep, techniqueName } from '../core/text/techniques'
import type { CorpusPuzzle } from './corpus'

/** A board from the corpus as a static figure, with the text that describes it. */
export interface Example {
  /** The corpus puzzle, which a share link opens in the app. */
  readonly puzzle: string
  readonly cells: readonly CellView[]
  /** Names the board, as the figure's caption. */
  readonly caption: string
  /** What the board shows, cell by cell, for a reader who cannot see it. */
  readonly facts: readonly string[]
}

/** The puzzle with the placements of its first `upTo` steps written in. */
function placedUpTo(board: Board, steps: readonly Step[], upTo: number): Board {
  let next = board
  for (const step of steps.slice(0, upTo)) {
    for (const { index, digit } of step.placements) next = place(next, index, digit)
  }
  return next
}

function struckMasks(eliminations: readonly CellDigit[]): Map<CellIndex, Mask> {
  const masks = new Map<CellIndex, Mask>()
  for (const { index, digit } of eliminations) {
    masks.set(index, withDigit(masks.get(index) ?? EMPTY_MASK, digit))
  }
  return masks
}

/** Givens in ink, earlier placements in the solver's voice, and candidates as corner notes. */
function cellViews(board: Board, candidates: readonly Mask[], step: Step | null): CellView[] {
  const placed = new Map(step?.placements.map(({ index, digit }) => [index, digit]))
  const cause = new Set(step?.cause.map(({ index }) => index))
  const struck = struckMasks(step?.eliminations ?? [])
  return CELLS.map((index): CellView => {
    const marks = cause.has(index) ? { cause: true } : {}
    const placedDigit = placed.get(index)
    if (placedDigit !== undefined) return { value: placedDigit, placed: true, ...marks }
    const digit = valueAt(board, index)
    if (digit !== null) {
      return isGiven(board, index) ? { value: digit, given: true } : { value: digit, solved: true }
    }
    const strikes = digitsOf(struck.get(index) ?? EMPTY_MASK)
    return {
      corner: digitsOf(lookup(candidates, index, EMPTY_MASK)),
      ...(strikes.length > 0 ? { struck: strikes } : {}),
      ...marks,
    }
  })
}

const cellList = (indices: readonly CellIndex[]): string => EN.and(indices.map(formatCell))

/** Each digit a step strikes, with the cells it leaves, in ascending order of digit. */
function removals(eliminations: readonly CellDigit[]): string[] {
  const byDigit = new Map<Digit, CellIndex[]>()
  for (const { index, digit } of eliminations)
    byDigit.set(digit, [...(byDigit.get(digit) ?? []), index])
  return [...byDigit]
    .sort(([a], [b]) => a - b)
    .map(([digit, cells]) => `Candidate ${String(digit)} is removed from ${cellList(cells)}.`)
}

/** A placement is the news. The peers it clears are drawn but not listed. */
function stepFacts(step: Step): string[] {
  const facts =
    step.cause.length > 0
      ? [`The pattern cells are ${cellList(step.cause.map(({ index }) => index))}.`]
      : []
  if (step.placements.length > 0) {
    return [
      ...facts,
      ...step.placements.map(
        ({ index, digit }) => `${String(digit)} is placed in ${formatCell(index)}.`,
      ),
    ]
  }
  return [...facts, ...removals(step.eliminations)]
}

const corpusName = (number: number) => `puzzle ${String(number)} of the solver's test corpus`

/** The first step of a technique in the corpus, drawn on the board just before the solver takes it. */
export function techniqueExample(
  corpus: readonly CorpusPuzzle[],
  technique: Technique,
): Example | null {
  for (const [position, { puzzle, steps }] of corpus.entries()) {
    const at = steps.findIndex((step) => step.technique === technique)
    const step = steps[at]
    const board = parseBoard(puzzle)
    if (step === undefined || board === null) continue
    const candidates = walkCandidates(board, { steps, cursor: at + 1, solution: board })
    return {
      puzzle,
      cells: cellViews(placedUpTo(board, steps, at), candidates, step),
      caption: `${techniqueName(technique)} in ${corpusName(position + 1)}, step ${String(at + 1)} of ${String(steps.length)}. ${explainStep(step)}`,
      facts: stepFacts(step),
    }
  }
  return null
}

/** The first corpus board that logic leaves unfinished, drawn where the last step left it. */
export function stuckExample(corpus: readonly CorpusPuzzle[]): Example | null {
  for (const [position, { puzzle, steps }] of corpus.entries()) {
    const board = parseBoard(puzzle)
    if (board === null) continue
    const after = placedUpTo(board, steps, steps.length)
    if (isBoardFull(after)) continue
    const candidates = walkCandidates(board, { steps, cursor: steps.length + 1, solution: board })
    const open = CELLS.filter((index) => valueAt(after, index) === null).length
    return {
      puzzle,
      cells: cellViews(after, candidates, null),
      caption: `Puzzle ${String(position + 1)} of the solver's test corpus after its last logical step, ${String(steps.length)} of ${String(steps.length)}. From here a search finishes the board.`,
      facts: [`${String(open)} cells are still empty, each shown with its remaining candidates.`],
    }
  }
  return null
}
