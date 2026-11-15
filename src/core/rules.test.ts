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

import { describe, expect, it } from 'vitest'

import {
  type Board,
  boardFromCells,
  type Cell,
  cellAt,
  EMPTY_BOARD,
  parseBoard,
  place,
  toggleMark,
  valueAt,
} from './board'
import { type CellIndex, digitsOf, FULL_MASK, maskOf } from './digits'
import { BOXES, CELLS, COLS, ROWS } from './geometry'
import {
  candidateMasks,
  canPlace,
  completedUnits,
  conflicts,
  digitCount,
  fillCandidates,
  isDigitComplete,
  isSolved,
  isWrong,
  peersHolding,
  toggleNote,
} from './rules'

const at = (n: number) => n as CellIndex

/** A board with these values, every other cell empty. */
const withValues = (values: Partial<Record<number, number>>, base: Board = EMPTY_BOARD): Board =>
  boardFromCells(
    CELLS.map((i): Cell => {
      const value = values[i]
      return value === undefined ? cellAt(base, i) : { ...cellAt(base, i), value: value as 1 }
    }),
  ) as Board

const SOLUTION_STRING =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
const solution = parseBoard(SOLUTION_STRING) as Board

/** The solved board with these cells left empty. */
const solvedExcept = (...empty: number[]): Board =>
  parseBoard(Array.from(SOLUTION_STRING, (d, i) => (empty.includes(i) ? '.' : d)).join('')) as Board

// Ported from validateBoard.
describe('conflicts', () => {
  it('should find no conflicts on an empty board', () => {
    expect(conflicts(EMPTY_BOARD).size).toBe(0)
  })

  it('should find a conflict in a row', () => {
    expect(conflicts(withValues({ 0: 5, 8: 5 }))).toEqual(new Set([0, 8]))
  })

  it('finds conflicts in a column and a box, and none on a solved board', () => {
    expect(conflicts(withValues({ 0: 5, 72: 5 }))).toEqual(new Set([0, 72]))
    expect(conflicts(withValues({ 0: 5, 20: 5 }))).toEqual(new Set([0, 20]))
    expect(conflicts(solution).size).toBe(0)
  })
})

// Ported from getConflictingPeers.
describe('peersHolding', () => {
  const board = withValues({ 0: 5, 8: 5, 9: 6 })

  it('should return conflicting indices for a move', () => {
    expect(peersHolding(board, at(1), 5)).toEqual([0, 8])
  })

  it('should return empty set for valid move', () => {
    expect(peersHolding(board, at(1), 7)).toEqual([])
  })
})

// Ported from isMoveValid.
describe('canPlace', () => {
  const board = withValues({ 0: 5, 1: 3, 4: 7, 9: 6, 12: 1, 13: 9, 14: 5, 19: 9, 20: 8, 25: 6 })

  it('should return true for a valid move', () => {
    expect(canPlace(board, at(2), 4)).toBe(true)
  })

  it('should return false for a move that conflicts with the row', () => {
    expect(canPlace(board, at(2), 5)).toBe(false)
  })

  it('should return false for a move that conflicts with the column', () => {
    expect(canPlace(board, at(2), 8)).toBe(false)
  })

  it('should return false for a move that conflicts with the box', () => {
    expect(canPlace(board, at(2), 6)).toBe(false)
  })
})

// Ported from calculateCandidates, where a filled cell had null instead of an empty mask.
describe('candidateMasks', () => {
  it('should return a full set for empty cells on an empty board', () => {
    const masks = candidateMasks(EMPTY_BOARD)
    expect(masks[0]).toBe(FULL_MASK)
    expect(masks[80]).toBe(FULL_MASK)
  })

  it('should return null for filled cells', () => {
    expect(candidateMasks(withValues({ 0: 5 }))[0]).toBe(0)
  })

  it('should eliminate candidates from peers of a filled cell', () => {
    const masks = candidateMasks(withValues({ 0: 5 }))
    expect(digitsOf(masks[1] ?? 0)).not.toContain(5)
    expect(digitsOf(masks[9] ?? 0)).not.toContain(5)
    expect(digitsOf(masks[10] ?? 0)).not.toContain(5)
    expect(digitsOf(masks[80] ?? 0)).toContain(5)
  })
})

describe('fillCandidates', () => {
  it('writes every empty cell its candidates and drops its center notes', () => {
    const board = toggleMark(withValues({ 0: 5, 1: 3 }), at(2), 'center', 7)
    const next = fillCandidates(board)
    expect(cellAt(next, at(2))).toEqual({
      value: null,
      given: false,
      candidates: maskOf([1, 2, 4, 6, 7, 8, 9]),
      centers: 0,
    })
    expect(valueAt(next, at(0))).toBe(5)
  })
})

describe('toggleNote', () => {
  const board = withValues({ 1: 7 })

  // Ported from toggleMark, which refused a clashing mark itself.
  it('returns the same board for a mark that conflicts with a peer', () => {
    expect(toggleNote(board, at(0), 'candidate', 7)).toBe(board)
    expect(toggleNote(board, at(0), 'center', 7)).toBe(board)
  })

  it('adds a note no peer contradicts and removes one that a peer now does', () => {
    const added = toggleNote(board, at(0), 'candidate', 4)
    expect(digitsOf(cellAt(added, at(0)).candidates)).toEqual([4])
    const stale = toggleMark(EMPTY_BOARD, at(0), 'center', 7)
    const clashing = withValues({ 1: 7 }, stale)
    expect(cellAt(toggleNote(clashing, at(0), 'center', 7), at(0)).centers).toBe(0)
  })
})

describe('isSolved', () => {
  it('needs every cell to hold the solution digit', () => {
    expect(isSolved(solution, solution)).toBe(true)
    expect(isSolved(solvedExcept(40), solution)).toBe(false)
    expect(isSolved(place(solvedExcept(40), at(40), 4), solution)).toBe(false)
  })

  it('never counts a solution with gaps as solved', () => {
    expect(isSolved(solvedExcept(40), solvedExcept(40))).toBe(false)
  })
})

describe('isWrong', () => {
  const board = place(withValues({ 1: 4 }, EMPTY_BOARD), at(0), 1)

  it('flags a placed digit that disagrees with the solution', () => {
    expect(isWrong(board, solution, at(0))).toBe(true)
    expect(isWrong(place(board, at(0), 5), solution, at(0))).toBe(false)
  })

  it('never flags a given or an empty cell', () => {
    const given = parseBoard('1' + '.'.repeat(80)) as Board
    expect(isWrong(given, solution, at(0))).toBe(false)
    expect(isWrong(board, solution, at(2))).toBe(false)
  })
})

// Ported from the completed-unit cases of findBoardMoment.
describe('completedUnits', () => {
  it('finds a row completed by the last correct digit', () => {
    const board = place(solvedExcept(0, 10, 72), at(0), 5)
    expect(completedUnits(board, solution, at(0))).toEqual([ROWS[0]])
  })

  it('finds every unit one placement completes together', () => {
    const board = place(solvedExcept(0, 80), at(0), 5)
    expect(completedUnits(board, solution, at(0))).toEqual([ROWS[0], COLS[0], BOXES[0]])
  })

  it('finds nothing for a wrong digit, or a full unit still holding a wrong one', () => {
    expect(completedUnits(place(solvedExcept(0, 10, 72), at(0), 4), solution, at(0))).toEqual([])
    const wrongPeer = place(place(solvedExcept(0, 1, 10, 72), at(1), 5), at(0), 5)
    expect(completedUnits(wrongPeer, solution, at(0))).toEqual([])
  })

  it('finds nothing against a solution with gaps', () => {
    expect(completedUnits(solution, solvedExcept(0), at(0))).toEqual([])
  })
})

describe('digit counts', () => {
  it('counts a digit and reads nine as complete', () => {
    expect(digitCount(solvedExcept(0), 5)).toBe(8)
    expect(isDigitComplete(solvedExcept(0), 5)).toBe(false)
    expect(isDigitComplete(solvedExcept(0), 3)).toBe(true)
  })
})
