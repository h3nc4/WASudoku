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

import {
  type Board,
  candidatesAt,
  centersAt,
  isGiven,
  type MarkKind,
  toggleMark,
  valueAt,
  withCandidates,
} from './board'
import { type CellIndex, type Digit, EMPTY_MASK, FULL_MASK, hasDigit, withoutDigit } from './digits'
import { CELLS, peersOf, SIZE, type Unit, UNITS, unitsOf } from './geometry'

/** Peers already holding the digit, which placing it here would clash with. */
export const peersHolding = (board: Board, index: CellIndex, digit: Digit): CellIndex[] =>
  peersOf(index).filter((peer) => valueAt(board, peer) === digit)

export const canPlace = (board: Board, index: CellIndex, digit: Digit): boolean =>
  peersHolding(board, index, digit).length === 0

/** Every cell whose digit repeats within one of its units. */
export function conflicts(board: Board): ReadonlySet<CellIndex> {
  const clashing = new Set<CellIndex>()
  for (const unit of UNITS) {
    for (const index of unit) {
      const digit = valueAt(board, index)
      if (
        digit !== null &&
        unit.some((other) => other !== index && valueAt(board, other) === digit)
      ) {
        clashing.add(index)
      }
    }
  }
  return clashing
}

/** The digits no peer holds, per cell, with an empty mask for a filled cell. */
export const candidateMasks = (board: Board): number[] =>
  CELLS.map((index) => {
    if (valueAt(board, index) !== null) return EMPTY_MASK
    return peersOf(index).reduce((mask, peer) => {
      const digit = valueAt(board, peer)
      return digit === null ? mask : withoutDigit(mask, digit)
    }, FULL_MASK)
  })

/** Auto-fill: every empty cell gets its candidates, and center notes give way to them. */
export const fillCandidates = (board: Board): Board => withCandidates(board, candidateMasks(board))

/** Removes a note, or adds one no peer contradicts. A clashing note returns the same board. */
export function toggleNote(board: Board, index: CellIndex, kind: MarkKind, digit: Digit): Board {
  const marks = kind === 'candidate' ? candidatesAt(board, index) : centersAt(board, index)
  if (!hasDigit(marks, digit) && !canPlace(board, index, digit)) return board
  return toggleMark(board, index, kind, digit)
}

/** Every cell holds the solution's digit. A solution with gaps never counts as solved. */
export const isSolved = (board: Board, solution: Board): boolean =>
  CELLS.every((index) => {
    const digit = valueAt(solution, index)
    return digit !== null && valueAt(board, index) === digit
  })

/** A digit the player placed that disagrees with the solution. */
export const isWrong = (board: Board, solution: Board, index: CellIndex): boolean => {
  const digit = valueAt(board, index)
  return !isGiven(board, index) && digit !== null && valueAt(solution, index) !== digit
}

/** The units through this cell that now match the solution in full. */
export const completedUnits = (board: Board, solution: Board, index: CellIndex): Unit[] =>
  unitsOf(index).filter((unit) =>
    unit.every((cell) => {
      const digit = valueAt(solution, cell)
      return digit !== null && valueAt(board, cell) === digit
    }),
  )

export const digitCount = (board: Board, digit: Digit): number =>
  CELLS.filter((index) => valueAt(board, index) === digit).length

/** Every unit already holds the digit once, so a board can hold no more of it. */
export const isDigitComplete = (board: Board, digit: Digit): boolean =>
  digitCount(board, digit) >= SIZE
