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

import { useState } from 'react'

import type { BoardState, CellState, GameMode, HistoryState } from '@/context/sudoku.types'

/** One cell the player just changed, a digit placed or a note toggled. */
export interface BoardMove {
  readonly index: number
  readonly kind: 'place' | 'mark'
  /** Every cell the move changed, the peers that lost notes included. */
  readonly touched: ReadonlySet<number>
}

/** A placement touches the cell and at most its 20 peers, so anything wider is a bulk change. */
const MAX_TOUCHED = 21

/**
 * Reads the change between two boards as one move.
 * Undo of many cells, auto-fill and a new puzzle return null.
 */
export function findBoardMove(prev: BoardState, next: BoardState): BoardMove | null {
  if (prev === next || prev.length !== next.length) return null
  const touched: number[] = []
  for (let i = 0; i < next.length; i++) {
    if (prev[i] === next[i]) continue
    touched.push(i)
    if (touched.length > MAX_TOUCHED) return null
  }

  const valueChanged = touched.filter((i) => prev[i].value !== next[i].value)
  if (valueChanged.length === 0) {
    return touched.length === 1
      ? { index: touched[0], kind: 'mark', touched: new Set(touched) }
      : null
  }
  if (valueChanged.length !== 1) return null
  const index = valueChanged[0]
  return next[index].value === null ? null : { index, kind: 'place', touched: new Set(touched) }
}

/** A rare one-shot tint across several cells, played once for the board change that caused it. */
export interface BoardMoment {
  /** A completed unit sweeps, a win ripples, a new puzzle reveals and an undo or redo marks what reverted. */
  readonly kind: 'sweep' | 'ripple' | 'reveal' | 'revert'
  /** The cells it plays on, each with its start delay in milliseconds. */
  readonly delays: ReadonlyMap<number, number>
}

/** The parts of the game state a board change is read against. */
export interface BoardSnapshot {
  readonly board: BoardState
  readonly history: HistoryState
  readonly solution: readonly number[] | null
  readonly isSolved: boolean
  readonly gameMode: GameMode
}

export interface BoardChange {
  readonly move: BoardMove | null
  readonly moment: BoardMoment | null
  /** Counts board changes, so a moment's layer remounts and replays even when its kind repeats. */
  readonly id: number
}

export const SWEEP_STAGGER_MS = 25
export const RIPPLE_STAGGER_MS = 25
export const REVEAL_STAGGER_MS = 30

const unitsOf = (index: number): number[][] => {
  const row = Math.floor(index / 9)
  const col = index % 9
  const boxStart = Math.floor(row / 3) * 27 + Math.floor(col / 3) * 3
  const range = Array.from({ length: 9 }, (_, i) => i)
  return [
    range.map((i) => row * 9 + i),
    range.map((i) => i * 9 + col),
    range.map((i) => boxStart + Math.floor(i / 3) * 9 + (i % 3)),
  ]
}

const sameSet = (a: ReadonlySet<number>, b: ReadonlySet<number>) =>
  a.size === b.size && [...a].every((v) => b.has(v))

const cellChanged = (a: CellState, b: CellState) =>
  a !== b &&
  (a.value !== b.value || !sameSet(a.candidates, b.candidates) || !sameSet(a.centers, b.centers))

const withDelays = (
  kind: BoardMoment['kind'],
  cells: Iterable<number>,
  delayOf: (index: number) => number,
): BoardMoment | null => {
  const delays = new Map<number, number>()
  for (const index of cells) delays.set(index, delayOf(index))
  return delays.size > 0 ? { kind, delays } : null
}

/** Each completed unit runs in its own order, and a cell shared by two runs takes the earlier start. */
const sweepOf = (units: readonly number[][]): BoardMoment => {
  const delays = new Map<number, number>()
  for (const unit of units) {
    unit.forEach((index, order) => {
      const delay = order * SWEEP_STAGGER_MS
      delays.set(index, Math.min(delays.get(index) ?? delay, delay))
    })
  }
  return { kind: 'sweep', delays }
}

const all = Array.from({ length: 81 }, (_, i) => i)

/**
 * Reads which moment, if any, follows a board change.
 * Ordinary moves get none, which keeps per-keystroke work to the cells the move touched.
 */
export function findBoardMoment(
  prev: BoardSnapshot,
  next: BoardSnapshot,
  move: BoardMove | null,
): BoardMoment | null {
  if (prev.board === next.board) return null

  // Undo and redo step through the same stack, while every other change writes a new one.
  if (next.history.stack === prev.history.stack) {
    if (next.history.index === prev.history.index) return null
    return withDelays(
      'revert',
      all.filter((i) => cellChanged(prev.board[i], next.board[i])),
      () => 0,
    )
  }

  if (next.history.stack.length === 1 && next.gameMode !== 'selecting') {
    // A validated custom puzzle keeps the digits already shown, so only digits new to the board fade in.
    const revealed = all.filter(
      (i) => next.board[i].value !== null && next.board[i].value !== prev.board[i]?.value,
    )
    return withDelays('reveal', revealed, (i) => {
      const box = Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3)
      return box * REVEAL_STAGGER_MS
    })
  }

  const { solution } = next
  if (move?.kind !== 'place' || next.gameMode !== 'playing' || solution === null) return null

  if (next.isSolved) {
    const row = Math.floor(move.index / 9)
    const col = move.index % 9
    return withDelays('ripple', all, (i) =>
      Math.round(Math.hypot(Math.floor(i / 9) - row, (i % 9) - col) * RIPPLE_STAGGER_MS),
    )
  }

  const completed = unitsOf(move.index).filter((unit) =>
    unit.every((i) => next.board[i].value === solution[i]),
  )
  return completed.length > 0 ? sweepOf(completed) : null
}

const NO_CHANGE: BoardChange = { move: null, moment: null, id: 0 }

/** Remembers the move and moment behind the latest board, so cells animate only what called for it. */
export function useBoardMove(snapshot: BoardSnapshot): BoardChange {
  const [prev, setPrev] = useState(snapshot)
  const [change, setChange] = useState(NO_CHANGE)
  if (snapshot.board !== prev.board) {
    const move = findBoardMove(prev.board, snapshot.board)
    setPrev(snapshot)
    setChange({ move, moment: findBoardMoment(prev, snapshot, move), id: change.id + 1 })
  }
  return change
}
