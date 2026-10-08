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
import { clearCell, parseSolution, placeValue, toggleMark } from '@/lib/board'
import { boardStateFromString } from '@/lib/utils'

import { type BoardSnapshot, findBoardMoment, findBoardMove, useBoardMove } from './useBoardMove'

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

const SOLUTION_STRING =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
const solution = parseSolution(SOLUTION_STRING)

/** The solved board with these cells left empty. */
const solvedExcept = (...empty: number[]): BoardState =>
  boardStateFromString(
    [...SOLUTION_STRING].map((digit, i) => (empty.includes(i) ? '0' : digit)).join(''),
  )

const snapshot = (board: BoardState, patch: Partial<BoardSnapshot> = {}): BoardSnapshot => ({
  board,
  history: { stack: [board], index: 0 },
  solution,
  isSolved: false,
  gameMode: 'playing',
  ...patch,
})

/** A player's placement, which writes a new history entry. */
const place = (prev: BoardSnapshot, index: number, value: number): BoardSnapshot => {
  const board = placeValue(prev.board, index, value)
  const stack = [...prev.history.stack.slice(0, prev.history.index + 1), board]
  return {
    ...prev,
    board,
    history: { stack, index: stack.length - 1 },
    isSolved: board.every((cell, i) => cell.value === solution[i]),
  }
}

const momentOf = (prev: BoardSnapshot, next: BoardSnapshot) =>
  findBoardMoment(prev, next, findBoardMove(prev.board, next.board))

describe('findBoardMoment', () => {
  it('sweeps a row completed by the last correct digit, in row order', () => {
    // Empty cells 10 and 72 leave column 0 and box 0 open.
    const prev = snapshot(solvedExcept(0, 10, 72))
    const moment = momentOf(prev, place(prev, 0, 5))
    expect(moment?.kind).toBe('sweep')
    expect([...(moment?.delays ?? [])]).toEqual(Array.from({ length: 9 }, (_, i) => [i, i * 25]))
  })

  it('sweeps every unit one placement completes together, a shared cell taking its earliest start', () => {
    const prev = snapshot(solvedExcept(0, 80))
    const moment = momentOf(prev, place(prev, 0, 5))
    expect(moment?.kind).toBe('sweep')
    expect(moment?.delays.size).toBe(21)
    expect(moment?.delays.get(0)).toBe(0)
    expect(moment?.delays.get(8)).toBe(200)
    expect(moment?.delays.get(72)).toBe(200)
    // Cell 9 is second in column 0 and fourth in box 0.
    expect(moment?.delays.get(9)).toBe(25)
    expect(moment?.delays.get(20)).toBe(200)
  })

  it('sweeps nothing for a wrong digit, or a full unit still holding a wrong one', () => {
    const prev = snapshot(solvedExcept(0, 10, 72))
    expect(momentOf(prev, place(prev, 0, 4))).toBeNull()

    const wrongPeer = snapshot(placeValue(solvedExcept(0, 1, 10, 72), 1, 5))
    expect(momentOf(wrongPeer, place(wrongPeer, 0, 5))).toBeNull()
  })

  it('sweeps nothing for a placement that completes no unit, or for a note', () => {
    const prev = snapshot(solvedExcept(0, 1, 10, 72))
    expect(momentOf(prev, place(prev, 0, 5))).toBeNull()

    const board = toggleMark(prev.board, 1, 'candidate', 3)
    const noted = { ...prev, board, history: { stack: [prev.board, board], index: 1 } }
    expect(momentOf(prev, noted)).toBeNull()
  })

  it('ripples the whole board outward from the winning cell instead of sweeping', () => {
    const prev = snapshot(solvedExcept(40))
    const moment = momentOf(prev, place(prev, 40, 5))
    expect(moment?.kind).toBe('ripple')
    expect(moment?.delays.size).toBe(81)
    expect(moment?.delays.get(40)).toBe(0)
    expect(moment?.delays.get(41)).toBe(25)
    expect(moment?.delays.get(0)).toBe(Math.round(Math.hypot(4, 4) * 25))
  })

  it('marks what an undo or redo changed, and never sweeps or ripples for it', () => {
    const start = snapshot(toggleMark(solvedExcept(0, 80), 80, 'candidate', 9))
    const won = place(place(start, 0, 5), 80, 9)
    const undo = { ...won, board: won.history.stack[1], history: { ...won.history, index: 1 } }

    const reverted = momentOf(won, undo)
    expect(reverted?.kind).toBe('revert')
    expect([...(reverted?.delays.keys() ?? [])]).toEqual([80])

    const redo = { ...undo, board: won.board, history: won.history, isSolved: true }
    expect(momentOf(undo, redo)?.kind).toBe('revert')
  })

  it('marks the cell whose notes an undo took back', () => {
    const before = snapshot(createEmptyBoard())
    const board = toggleMark(before.board, 50, 'center', 3)
    const noted = { ...before, board, history: { stack: [before.board, board], index: 1 } }
    const undo = { ...noted, board: before.board, history: { ...noted.history, index: 0 } }

    const reverted = momentOf(noted, undo)
    expect(reverted?.kind).toBe('revert')
    expect([...(reverted?.delays.keys() ?? [])]).toEqual([50])
  })

  it('plays nothing when the board did not change', () => {
    const same = snapshot(solvedExcept(0))
    expect(findBoardMoment(same, same, null)).toBeNull()
  })

  it('reveals the givens of a new puzzle box by box', () => {
    const prev = place(snapshot(createEmptyBoard()), 4, 7)
    const puzzle = solvedExcept(...Array.from({ length: 79 }, (_, i) => i + 1))
    const moment = momentOf(prev, snapshot(puzzle))
    expect(moment?.kind).toBe('reveal')
    expect([...(moment?.delays ?? [])]).toEqual([
      [0, 0],
      [80, 240],
    ])
  })

  it('reveals nothing when a validated custom puzzle keeps the digits already shown', () => {
    const typed = solvedExcept(0)
    const prev = snapshot(typed, { gameMode: 'customInput', solution: null })
    const validated = typed.map((cell) => ({ ...cell, isGiven: cell.value !== null }))
    expect(momentOf(prev, snapshot(validated))).toBeNull()
  })

  it('reveals nothing for the board behind the selection screen', () => {
    const prev = snapshot(solvedExcept(0))
    const empty = solvedExcept(...Array.from({ length: 81 }, (_, i) => i))
    expect(momentOf(prev, snapshot(empty, { gameMode: 'selecting' }))).toBeNull()
  })

  it('plays nothing outside play or without a solution', () => {
    const custom = snapshot(solvedExcept(0, 10, 72), { gameMode: 'customInput' })
    expect(momentOf(custom, place(custom, 0, 5))).toBeNull()

    const unsolved = snapshot(solvedExcept(0, 10, 72), { solution: null })
    expect(momentOf(unsolved, { ...place(unsolved, 0, 5), isSolved: false })).toBeNull()
  })
})

describe('useBoardMove', () => {
  it('reports nothing for the snapshot it first sees, so a reloaded game plays no moment', () => {
    const { result } = renderHook(({ state }) => useBoardMove(state), {
      initialProps: { state: snapshot(notedBoard()) },
    })
    expect(result.current).toEqual({ move: null, moment: null, id: 0 })
  })

  it('reports the move and moment behind each new board and keeps them across renders', () => {
    const before = snapshot(solvedExcept(0, 10, 72))
    const after = place(before, 0, 5)
    const { result, rerender } = renderHook(({ state }) => useBoardMove(state), {
      initialProps: { state: before },
    })

    rerender({ state: after })
    expect(result.current).toMatchObject({ move: { index: 0, kind: 'place' }, id: 1 })
    expect(result.current.moment?.kind).toBe('sweep')
    rerender({ state: { ...after, isSolved: false } })
    expect(result.current).toMatchObject({ move: { index: 0 }, moment: { kind: 'sweep' }, id: 1 })

    const noted = { ...after, board: toggleMark(after.board, 10, 'candidate', 7) }
    rerender({ state: noted })
    expect(result.current).toMatchObject({ move: { index: 10, kind: 'mark' }, moment: null, id: 2 })
  })

  it('reports a placement as the move, as before', () => {
    const before = notedBoard()
    const after = placeValue(before, 0, 5)
    const { result, rerender } = renderHook(({ state }) => useBoardMove(state), {
      initialProps: { state: snapshot(before) },
    })
    rerender({ state: snapshot(after) })
    expect(result.current.move).toMatchObject({ index: 0, kind: 'place' })
  })
})
