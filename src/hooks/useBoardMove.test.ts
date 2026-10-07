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

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createEmptyBoard } from '@/context/reducer/state'
import type { BoardState } from '@/context/sudoku.types'
import { clearCell, placeValue, toggleMark } from '@/lib/board'

import { findBoardMove, useBoardMove } from './useBoardMove'

/** An empty board with the candidate 5 noted in row 0, cells 1 to 3, and in cell 40. */
const notedBoard = (): BoardState =>
  [1, 2, 3, 40].reduce<BoardState>(
    (board, index) => toggleMark(board, index, 'candidate', 5),
    createEmptyBoard(),
  )

describe('findBoardMove', () => {
  it('reads a placement with the peers whose notes it removed', () => {
    const before = notedBoard()
    const move = findBoardMove(before, placeValue(before, 0, 5))
    expect(move).toEqual({ index: 0, kind: 'place', touched: new Set([0, 1, 2, 3]) })
  })

  it('reads a toggled note as a mark move on that cell', () => {
    const before = createEmptyBoard()
    expect(findBoardMove(before, toggleMark(before, 7, 'candidate', 3))).toEqual({
      index: 7,
      kind: 'mark',
      touched: new Set([7]),
    })
  })

  it('treats an erase as no move, so the digit snaps away', () => {
    const before = placeValue(createEmptyBoard(), 0, 5)
    expect(findBoardMove(before, clearCell(before, 0))).toBeNull()
  })

  it('treats the same board as no move', () => {
    const board = createEmptyBoard()
    expect(findBoardMove(board, board)).toBeNull()
  })

  it('treats a change of many notes, such as auto-fill or its undo, as no move', () => {
    const before = createEmptyBoard()
    const after = before.map((cell) => ({ ...cell, candidates: new Set([1, 2]) }))
    expect(findBoardMove(before, after)).toBeNull()
  })

  it('treats a change of several digits, such as a new puzzle, as no move', () => {
    const before = createEmptyBoard()
    const after = placeValue(placeValue(before, 0, 1), 40, 2)
    expect(findBoardMove(before, after)).toBeNull()
  })

  it('treats two changed notes without a digit as no move', () => {
    const before = createEmptyBoard()
    const after = toggleMark(toggleMark(before, 0, 'candidate', 1), 40, 'candidate', 2)
    expect(findBoardMove(before, after)).toBeNull()
  })
})

describe('useBoardMove', () => {
  it('reports nothing for the board it first sees', () => {
    const { result } = renderHook(({ board }) => useBoardMove(board), {
      initialProps: { board: notedBoard() },
    })
    expect(result.current).toBeNull()
  })

  it('reports the move behind each new board and keeps it across renders', () => {
    const before = notedBoard()
    const after = placeValue(before, 0, 5)
    const { result, rerender } = renderHook(({ board }) => useBoardMove(board), {
      initialProps: { board: before },
    })

    rerender({ board: after })
    expect(result.current).toMatchObject({ index: 0, kind: 'place' })
    rerender({ board: after })
    expect(result.current).toMatchObject({ index: 0, kind: 'place' })

    rerender({ board: before })
    expect(result.current).toBeNull()
  })
})
