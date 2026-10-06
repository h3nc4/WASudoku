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

import type { BoardState, CellState } from '@/context/sudoku.types'

import { getRelatedCellIndices, isMoveValid } from './utils'

/** Parses a solver solution string, mapping an unsolved '.' to 0. */
export const parseSolution = (solution: string): number[] =>
  solution.split('').map((c) => (c === '.' ? 0 : Number.parseInt(c, 10)))

const without = (marks: ReadonlySet<number>, value: number): ReadonlySet<number> => {
  const next = new Set(marks)
  next.delete(value)
  return next
}

/**
 * Places a value and removes it from the marks of every peer.
 * Only the target and the peers whose marks change get new objects.
 */
export function placeValue(board: BoardState, index: number, value: number): BoardState {
  const next = board.slice()
  next[index] = {
    ...board[index],
    value,
    candidates: new Set<number>(),
    centers: new Set<number>(),
  }

  getRelatedCellIndices(index).forEach((peer) => {
    const cell = next[peer]
    if (!cell.candidates.has(value) && !cell.centers.has(value)) return
    next[peer] = {
      ...cell,
      candidates: without(cell.candidates, value),
      centers: without(cell.centers, value),
    }
  })

  return next
}

/**
 * Toggles a candidate or center mark on one cell.
 * Returns the same board when the mark would conflict with a peer.
 */
export function toggleMark(
  board: BoardState,
  index: number,
  mode: 'candidate' | 'center',
  value: number,
): BoardState {
  const cell = board[index]
  const marks = mode === 'candidate' ? cell.candidates : cell.centers
  let updated: ReadonlySet<number>

  if (marks.has(value)) {
    updated = without(marks, value)
  } else if (isMoveValid(board, index, value)) {
    updated = new Set(marks).add(value)
  } else {
    return board
  }

  const nextCell: CellState =
    mode === 'candidate'
      ? { ...cell, candidates: updated }
      : { ...cell, candidates: new Set<number>(), centers: updated }

  const next = board.slice()
  next[index] = nextCell
  return next
}

/** Empties one cell of its value and every mark. */
export function clearCell(board: BoardState, index: number): BoardState {
  const next = board.slice()
  next[index] = {
    ...board[index],
    value: null,
    candidates: new Set<number>(),
    centers: new Set<number>(),
  }
  return next
}
