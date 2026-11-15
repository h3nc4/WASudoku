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

import type { Board } from './board'

/** Boards kept for undo, the present one included. */
export const MAX_HISTORY = 100

/** Undo and redo over immutable boards, so a snapshot is shared rather than copied. */
export interface History {
  /** Oldest first, so the last one is what undo returns to. */
  readonly past: readonly Board[]
  readonly present: Board
  /** Nearest first, so the first one is what redo returns to. */
  readonly future: readonly Board[]
}

export const startHistory = (board: Board): History => ({ past: [], present: board, future: [] })

/** Records a new present, drops the redo tail and forgets the oldest boards past the cap. */
export const push = (history: History, board: Board): History => ({
  past: [...history.past, history.present].slice(-(MAX_HISTORY - 1)),
  present: board,
  future: [],
})

export const canUndo = (history: History): boolean => history.past.length > 0
export const canRedo = (history: History): boolean => history.future.length > 0

/** Steps back one board, or returns the same history at the start. */
export function undo(history: History): History {
  const previous = history.past.at(-1)
  if (previous === undefined) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  }
}

/** Steps forward one board, or returns the same history at the end. */
export function redo(history: History): History {
  const [next, ...future] = history.future
  if (next === undefined) return history
  return { past: [...history.past, history.present], present: next, future }
}

/** The stack and index that storage and the old state model use. */
export const toStack = (history: History): { stack: Board[]; index: number } => ({
  stack: [...history.past, history.present, ...history.future],
  index: history.past.length,
})

/** Rebuilds a history from a stack and the index of its present, or null when out of range. */
export function fromStack(stack: readonly Board[], index: number): History | null {
  const present = Number.isInteger(index) ? stack[index] : undefined
  if (present === undefined) return null
  return { past: stack.slice(0, index), present, future: stack.slice(index + 1) }
}
