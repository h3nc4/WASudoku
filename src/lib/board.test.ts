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

import { createEmptyBoard } from '@/context/sudoku.reducer'
import type { BoardState, CellState } from '@/context/sudoku.types'

import { clearCell, parseSolution, placeValue, toggleMark } from './board'
import { getRelatedCellIndices } from './utils'

const withCell = (board: BoardState, index: number, cell: Partial<CellState>): BoardState =>
  board.map((c, i) => (i === index ? { ...c, ...cell } : c))

const snapshot = (board: BoardState) =>
  board.map((c) => ({ value: c.value, candidates: [...c.candidates], centers: [...c.centers] }))

const expectOnlyChanged = (before: BoardState, after: BoardState, changed: number[]) => {
  after.forEach((cell, i) => {
    if (changed.includes(i)) {
      expect(cell).not.toBe(before[i])
    } else {
      expect(cell).toBe(before[i])
    }
  })
}

describe('parseSolution', () => {
  it('parses every digit', () => {
    expect(parseSolution('123456789')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it("maps '.' to 0 rather than NaN", () => {
    expect(parseSolution('1.3')).toEqual([1, 0, 3])
  })
})

describe('placeValue', () => {
  // Cell 1 is a peer of 0 holding the value, 2 is a peer without it, 80 is no peer.
  let board = withCell(createEmptyBoard(), 1, {
    candidates: new Set([5, 6]),
    centers: new Set([5]),
  })
  board = withCell(board, 2, { candidates: new Set([6]) })
  board = withCell(board, 80, { candidates: new Set([5]) })

  it('sets the value and clears the marks of the target', () => {
    const next = placeValue(withCell(board, 0, { candidates: new Set([5]) }), 0, 5)
    expect(next[0].value).toBe(5)
    expect(next[0].candidates.size).toBe(0)
    expect(next[0].centers.size).toBe(0)
  })

  it('removes the value from the marks of every peer', () => {
    const next = placeValue(board, 0, 5)
    expect([...next[1].candidates]).toEqual([6])
    expect(next[1].centers.size).toBe(0)
    expect([...next[80].candidates]).toEqual([5])
    getRelatedCellIndices(0).forEach((i) => expect(next[i].candidates.has(5)).toBe(false))
  })

  it('replaces only the target and the peers whose marks change', () => {
    expectOnlyChanged(board, placeValue(board, 0, 5), [0, 1])
  })

  it('leaves the previous board and its sets untouched', () => {
    const before = snapshot(board)
    const cells = [...board]
    placeValue(board, 0, 5)
    expect(board).toEqual(cells)
    expect(snapshot(board)).toEqual(before)
  })
})

describe('toggleMark', () => {
  const board = withCell(createEmptyBoard(), 0, {
    candidates: new Set([1, 2]),
    centers: new Set([3]),
  })

  it('adds and removes a candidate', () => {
    const added = toggleMark(board, 0, 'candidate', 4)
    expect([...added[0].candidates].sort()).toEqual([1, 2, 4])
    expect(added[0].centers).toBe(board[0].centers)
    expect([...toggleMark(added, 0, 'candidate', 4)[0].candidates].sort()).toEqual([1, 2])
  })

  it('clears candidates when a center mark is toggled', () => {
    const added = toggleMark(board, 0, 'center', 4)
    expect(added[0].candidates.size).toBe(0)
    expect([...added[0].centers].sort()).toEqual([3, 4])
    const removed = toggleMark(board, 0, 'center', 3)
    expect(removed[0].candidates.size).toBe(0)
    expect(removed[0].centers.size).toBe(0)
  })

  it('returns the same board for a mark that conflicts with a peer', () => {
    const conflicting = withCell(board, 1, { value: 7 })
    expect(toggleMark(conflicting, 0, 'candidate', 7)).toBe(conflicting)
    expect(toggleMark(conflicting, 0, 'center', 7)).toBe(conflicting)
  })

  it('replaces only the target cell and mutates no shared set', () => {
    const before = snapshot(board)
    for (const mode of ['candidate', 'center'] as const) {
      expectOnlyChanged(board, toggleMark(board, 0, mode, 1), [0])
      expectOnlyChanged(board, toggleMark(board, 0, mode, 5), [0])
    }
    expect(snapshot(board)).toEqual(before)
  })
})

describe('clearCell', () => {
  const board = withCell(createEmptyBoard(), 10, {
    value: 4,
    candidates: new Set([1]),
    centers: new Set([2]),
  })

  it('empties the value and marks of one cell only', () => {
    const before = snapshot(board)
    const next = clearCell(board, 10)
    expect(next[10]).toEqual({
      ...board[10],
      value: null,
      candidates: new Set(),
      centers: new Set(),
    })
    expectOnlyChanged(board, next, [10])
    expect(snapshot(board)).toEqual(before)
  })
})
