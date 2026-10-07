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

import type { BoardState } from '@/context/sudoku.types'

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

/** Remembers the move behind the latest board, so cells animate only what the player did. */
export function useBoardMove(board: BoardState): BoardMove | null {
  const [prev, setPrev] = useState(board)
  const [move, setMove] = useState<BoardMove | null>(null)
  if (board !== prev) {
    setPrev(board)
    setMove(findBoardMove(prev, board))
  }
  return move
}
