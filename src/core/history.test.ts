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

import { type Board, EMPTY_BOARD, place } from './board'
import type { CellIndex, Digit } from './digits'
import {
  canRedo,
  canUndo,
  fromStack,
  type History,
  MAX_HISTORY,
  push,
  redo,
  startHistory,
  toStack,
  undo,
} from './history'

const boardWith = (digit: Digit): Board => place(EMPTY_BOARD, 0 as CellIndex, digit)

// Ported from the UNDO and REDO reducer cases.
describe('history', () => {
  const full: History = push(push(startHistory(EMPTY_BOARD), boardWith(1)), boardWith(2))

  it('should UNDO to the previous state', () => {
    const back = undo(full)
    expect(back.present).toBe(full.past[1])
    expect(toStack(back).index).toBe(1)
    expect(canRedo(back)).toBe(true)
  })

  it('should not UNDO past the beginning of history', () => {
    const start = startHistory(EMPTY_BOARD)
    expect(canUndo(start)).toBe(false)
    expect(undo(start)).toBe(start)
  })

  it('should REDO to the next state', () => {
    const back = undo(full)
    const forward = redo(back)
    expect(forward.present).toEqual(full.present)
    expect(toStack(forward)).toEqual(toStack(full))
  })

  it('should not REDO past the end of history', () => {
    expect(canRedo(full)).toBe(false)
    expect(redo(full)).toBe(full)
  })

  it('should prune history when it exceeds the maximum size', () => {
    let history = startHistory(EMPTY_BOARD)
    for (let i = 0; i < MAX_HISTORY + 5; i++)
      history = push(history, boardWith(((i % 9) + 1) as Digit))
    const { stack, index } = toStack(history)
    expect(MAX_HISTORY).toBe(100)
    expect(stack).toHaveLength(MAX_HISTORY)
    expect(index).toBe(MAX_HISTORY - 1)
    expect(stack[0]).not.toBe(EMPTY_BOARD)
  })

  it('drops the redo tail on a new board', () => {
    const branched = push(undo(undo(full)), boardWith(9))
    expect(toStack(branched).stack).toEqual([EMPTY_BOARD, boardWith(9)])
    expect(canRedo(branched)).toBe(false)
  })

  it('shares boards rather than copying them', () => {
    const next = push(full, boardWith(3))
    expect(next.past[2]).toBe(full.present)
  })
})

describe('stack form', () => {
  const stack = [EMPTY_BOARD, boardWith(1), boardWith(2)]

  it('round-trips a stack and the index of its present', () => {
    const history = fromStack(stack, 1)
    expect(history?.present).toBe(stack[1])
    expect(toStack(history as History)).toEqual({ stack, index: 1 })
  })

  it.each([-1, 3, 0.5, Number.NaN])('rejects index %d', (index) => {
    expect(fromStack(stack, index)).toBeNull()
  })

  it('rejects an empty stack', () => {
    expect(fromStack([], 0)).toBeNull()
  })
})
