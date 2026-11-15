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
  boardsEqual,
  boardToString,
  type Cell,
  cellAt,
  cellCode,
  changedCells,
  clear,
  EMPTY_BOARD,
  findMove,
  isBoardEmpty,
  isBoardFull,
  isBoardString,
  isGiven,
  parseBoard,
  place,
  toggleMark,
  valueAt,
  withCandidates,
  withGivens,
} from './board'
import { type CellIndex, digitsOf, FULL_MASK, maskOf } from './digits'
import { CELLS, peersOf } from './geometry'

const at = (n: number) => n as CellIndex
const EMPTY_CELL: Cell = { value: null, given: false, candidates: 0, centers: 0 }

const withCell = (board: Board, index: number, patch: Partial<Cell>): Board =>
  boardFromCells(
    CELLS.map((i) => (i === index ? { ...cellAt(board, i), ...patch } : cellAt(board, i))),
  ) as Board

const cellsOf = (board: Board) => CELLS.map((i) => cellAt(board, i))

describe('cells', () => {
  it('packs and unpacks every field of a cell', () => {
    const cell: Cell = { value: 9, given: true, candidates: FULL_MASK, centers: maskOf([2, 7]) }
    const board = withCell(EMPTY_BOARD, 3, cell)
    expect(cellAt(board, at(3))).toEqual(cell)
    expect(cellAt(board, at(4))).toEqual(EMPTY_CELL)
  })

  it('keeps a given flag on an empty cell', () => {
    const board = withCell(EMPTY_BOARD, 5, { given: true })
    expect(valueAt(board, at(5))).toBeNull()
    expect(isGiven(board, at(5))).toBe(true)
  })

  it('reads a stray index as an empty cell', () => {
    expect(cellCode(withCell(EMPTY_BOARD, 0, { value: 1 }), at(81))).toBe(0)
  })

  it('refuses a board of the wrong size or with a mask past nine bits', () => {
    expect(boardFromCells([EMPTY_CELL])).toBeNull()
    const withFirst = (cell: Cell) => cellsOf(EMPTY_BOARD).map((c, i) => (i === 0 ? cell : c))
    expect(boardFromCells(withFirst({ ...EMPTY_CELL, candidates: FULL_MASK + 1 }))).toBeNull()
    expect(boardFromCells(withFirst({ ...EMPTY_CELL, centers: -1 }))).toBeNull()
  })
})

describe('place', () => {
  // Cell 1 is a peer of 0 holding the value, 2 is a peer without it, 80 is no peer.
  let board = withCell(EMPTY_BOARD, 1, { candidates: maskOf([5, 6]), centers: maskOf([5]) })
  board = withCell(board, 2, { candidates: maskOf([6]) })
  board = withCell(board, 80, { candidates: maskOf([5]) })

  it('sets the value and clears the marks of the target', () => {
    const next = place(withCell(board, 0, { candidates: maskOf([5]) }), at(0), 5)
    expect(cellAt(next, at(0))).toEqual({ ...EMPTY_CELL, value: 5 })
  })

  it('removes the value from the marks of every peer', () => {
    const next = place(board, at(0), 5)
    expect(digitsOf(cellAt(next, at(1)).candidates)).toEqual([6])
    expect(cellAt(next, at(1)).centers).toBe(0)
    expect(digitsOf(cellAt(next, at(80)).candidates)).toEqual([5])
    for (const peer of peersOf(at(0)))
      expect(digitsOf(cellAt(next, peer).candidates)).not.toContain(5)
  })

  it('changes only the target and the peers whose marks change', () => {
    expect(changedCells(board, place(board, at(0), 5))).toEqual([0, 1])
  })

  it('leaves the previous board untouched', () => {
    const before = cellsOf(board)
    place(board, at(0), 5)
    expect(cellsOf(board)).toEqual(before)
  })

  it('keeps the given flag of the cell', () => {
    expect(isGiven(place(withCell(board, 0, { given: true }), at(0), 5), at(0))).toBe(true)
  })
})

describe('toggleMark', () => {
  const board = withCell(EMPTY_BOARD, 0, { candidates: maskOf([1, 2]), centers: maskOf([3]) })

  it('adds and removes a candidate', () => {
    const added = toggleMark(board, at(0), 'candidate', 4)
    expect(digitsOf(cellAt(added, at(0)).candidates)).toEqual([1, 2, 4])
    expect(cellAt(added, at(0)).centers).toBe(maskOf([3]))
    expect(digitsOf(cellAt(toggleMark(added, at(0), 'candidate', 4), at(0)).candidates)).toEqual([
      1, 2,
    ])
  })

  it('clears candidates when a center mark is toggled', () => {
    const added = toggleMark(board, at(0), 'center', 4)
    expect(cellAt(added, at(0)).candidates).toBe(0)
    expect(digitsOf(cellAt(added, at(0)).centers)).toEqual([3, 4])
    const removed = toggleMark(board, at(0), 'center', 3)
    expect(cellAt(removed, at(0)).candidates).toBe(0)
    expect(cellAt(removed, at(0)).centers).toBe(0)
  })

  it('changes only the target cell and leaves the previous board untouched', () => {
    const before = cellsOf(board)
    for (const kind of ['candidate', 'center'] as const) {
      expect(changedCells(board, toggleMark(board, at(0), kind, 1))).toEqual([0])
      expect(changedCells(board, toggleMark(board, at(0), kind, 5))).toEqual([0])
    }
    expect(cellsOf(board)).toEqual(before)
  })
})

describe('clear', () => {
  const board = withCell(EMPTY_BOARD, 10, {
    value: 4,
    given: true,
    candidates: maskOf([1]),
    centers: maskOf([2]),
  })

  it('empties the value and marks of one cell only, keeping its given flag', () => {
    const before = cellsOf(board)
    const next = clear(board, at(10))
    expect(cellAt(next, at(10))).toEqual({ ...EMPTY_CELL, given: true })
    expect(changedCells(board, next)).toEqual([10])
    expect(cellsOf(board)).toEqual(before)
  })
})

describe('withCandidates', () => {
  it('writes candidates into empty cells, clears their centers and skips filled cells', () => {
    let board = withCell(EMPTY_BOARD, 0, { value: 5 })
    board = withCell(board, 1, { centers: maskOf([7]) })
    const masks = CELLS.map(() => maskOf([1, 2]))
    const next = withCandidates(board, masks)
    expect(cellAt(next, at(0))).toEqual({ ...EMPTY_CELL, value: 5 })
    expect(cellAt(next, at(1))).toEqual({ ...EMPTY_CELL, candidates: maskOf([1, 2]) })
  })

  it('reads a missing mask as no candidates', () => {
    const board = withCell(EMPTY_BOARD, 0, { candidates: maskOf([3]) })
    expect(cellAt(withCandidates(board, []), at(0)).candidates).toBe(0)
  })
})

describe('withGivens', () => {
  it('marks filled cells as given and empty ones as not', () => {
    let board = withCell(EMPTY_BOARD, 0, { value: 5 })
    board = withCell(board, 1, { given: true })
    const next = withGivens(board)
    expect(isGiven(next, at(0))).toBe(true)
    expect(isGiven(next, at(1))).toBe(false)
  })
})

// Ported from areBoardsEqual.
describe('boardsEqual', () => {
  it('should return true for identical boards', () => {
    expect(boardsEqual(EMPTY_BOARD, boardFromCells(cellsOf(EMPTY_BOARD)) as Board)).toBe(true)
  })

  it('should return true for the same board instance', () => {
    expect(boardsEqual(EMPTY_BOARD, EMPTY_BOARD)).toBe(true)
    expect(changedCells(EMPTY_BOARD, EMPTY_BOARD)).toEqual([])
  })

  it.each<[string, Partial<Cell>, Partial<Cell>]>([
    ['values', { value: 5 }, {}],
    ['isGiven flags', { given: true }, {}],
    ['candidates', { candidates: maskOf([1]) }, {}],
    ['centers', { centers: maskOf([1]) }, {}],
    [
      'candidate set contents but same size',
      { candidates: maskOf([1]) },
      { candidates: maskOf([2]) },
    ],
    ['center set contents but same size', { centers: maskOf([1]) }, { centers: maskOf([2]) }],
    [
      'overlapping sets with distinct elements',
      { candidates: maskOf([1, 2]) },
      { candidates: maskOf([1, 3]) },
    ],
  ])('should return false for boards with different %s', (_, a, b) => {
    expect(boardsEqual(withCell(EMPTY_BOARD, 0, a), withCell(EMPTY_BOARD, 0, b))).toBe(false)
  })
})

describe('board strings', () => {
  // Ported from boardStateToString and boardStateFromString.
  it('should convert a board state to a string', () => {
    const board = withCell(withCell(EMPTY_BOARD, 0, { value: 5 }), 2, { value: 9 })
    expect(boardToString(board)).toBe('5.9' + '.'.repeat(78))
  })

  it('should parse a valid string into a board state', () => {
    const board = parseBoard('5.9' + '.'.repeat(78)) as Board
    expect(cellAt(board, at(0))).toEqual({ ...EMPTY_CELL, value: 5, given: true })
    expect(cellAt(board, at(1))).toEqual(EMPTY_CELL)
    expect(cellAt(board, at(2))).toEqual({ ...EMPTY_CELL, value: 9, given: true })
  })

  it('reads 0 as an empty cell', () => {
    expect(boardToString(parseBoard('0'.repeat(81)) as Board)).toBe('.'.repeat(81))
  })

  // Ported from isBoardStringValid.
  it('should return true for a valid string', () => {
    expect(isBoardString('.'.repeat(81))).toBe(true)
    expect(isBoardString('123456789'.repeat(9))).toBe(true)
  })

  it('should return false for a string with incorrect length', () => {
    expect(isBoardString('.'.repeat(80))).toBe(false)
    expect(parseBoard('.'.repeat(80))).toBeNull()
  })

  it('should return false for a string with invalid characters', () => {
    expect(isBoardString('a'.repeat(81))).toBe(false)
  })
})

describe('emptiness', () => {
  it('tells an empty, a partial and a full board apart', () => {
    const full = parseBoard('123456789'.repeat(9)) as Board
    const partial = withCell(EMPTY_BOARD, 40, { value: 1 })
    expect([isBoardEmpty(EMPTY_BOARD), isBoardFull(EMPTY_BOARD)]).toEqual([true, false])
    expect([isBoardEmpty(partial), isBoardFull(partial)]).toEqual([false, false])
    expect([isBoardEmpty(full), isBoardFull(full)]).toEqual([false, true])
  })

  it('counts notes as empty', () => {
    expect(isBoardEmpty(withCell(EMPTY_BOARD, 0, { candidates: maskOf([1]) }))).toBe(true)
  })
})

// Ported from findBoardMove.
describe('findMove', () => {
  /** An empty board with the candidate 5 noted in row 0, cells 1 to 3, and in cell 40. */
  const notedBoard = (): Board =>
    [1, 2, 3, 40].reduce((board, i) => toggleMark(board, at(i), 'candidate', 5), EMPTY_BOARD)

  it('reads a placement with the peers whose notes it removed', () => {
    const before = notedBoard()
    expect(findMove(before, place(before, at(0), 5))).toEqual({
      index: 0,
      kind: 'place',
      touched: [0, 1, 2, 3],
    })
  })

  it('reads a toggled note as a mark move on that cell', () => {
    expect(findMove(EMPTY_BOARD, toggleMark(EMPTY_BOARD, at(7), 'candidate', 3))).toEqual({
      index: 7,
      kind: 'mark',
      touched: [7],
    })
  })

  it('treats an erase as no move, so the digit snaps away', () => {
    const before = place(EMPTY_BOARD, at(0), 5)
    expect(findMove(before, clear(before, at(0)))).toBeNull()
  })

  it('treats the same board, or an equal copy, as no move', () => {
    expect(findMove(EMPTY_BOARD, EMPTY_BOARD)).toBeNull()
    expect(findMove(EMPTY_BOARD, boardFromCells(cellsOf(EMPTY_BOARD)) as Board)).toBeNull()
  })

  it('treats a change of many notes, such as auto-fill or its undo, as no move', () => {
    const after = withCandidates(
      EMPTY_BOARD,
      CELLS.map(() => maskOf([1, 2])),
    )
    expect(findMove(EMPTY_BOARD, after)).toBeNull()
  })

  it('treats a change of several digits, such as a new puzzle, as no move', () => {
    const after = place(place(EMPTY_BOARD, at(0), 1), at(40), 2)
    expect(findMove(EMPTY_BOARD, after)).toBeNull()
  })

  it('treats two changed notes without a digit as no move', () => {
    const after = toggleMark(toggleMark(EMPTY_BOARD, at(0), 'candidate', 1), at(40), 'candidate', 2)
    expect(findMove(EMPTY_BOARD, after)).toBeNull()
  })
})
