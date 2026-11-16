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

import {
  type CellIndex,
  type Digit,
  EMPTY_MASK,
  FULL_MASK,
  isMask,
  toDigit,
  toggleDigit,
  withDigit,
} from './digits'
import { CELL_COUNT, CELLS, PEER_COUNT, peersOf } from './geometry'

// One small integer per cell: the value in 4 bits, the given flag, then the candidate and center masks.
const VALUE_BITS = 4
const VALUE_MASK = (1 << VALUE_BITS) - 1
const GIVEN_BIT = 1 << VALUE_BITS
const CANDIDATES_SHIFT = VALUE_BITS + 1
const MASK_BITS = 9
const CENTERS_SHIFT = CANDIDATES_SHIFT + MASK_BITS

/** An immutable board. Every update returns a new one, and only this module reads `cells`. */
export interface Board {
  readonly cells: readonly number[]
}

/** One cell unpacked, for codecs and tests. Prefer the accessors in hot paths. */
export interface Cell {
  readonly value: Digit | null
  readonly given: boolean
  readonly candidates: number
  readonly centers: number
}

export type MarkKind = 'candidate' | 'center'

const wrap = (cells: readonly number[]): Board => ({ cells })

const pack = ({ value, given, candidates, centers }: Cell): number =>
  (value ?? 0) |
  (given ? GIVEN_BIT : 0) |
  ((candidates & FULL_MASK) << CANDIDATES_SHIFT) |
  ((centers & FULL_MASK) << CENTERS_SHIFT)

/** The packed word of a cell. Two cells look the same exactly when their words are equal. */
export const cellCode = (board: Board, index: CellIndex): number => board.cells[index] ?? 0

export const valueAt = (board: Board, index: CellIndex): Digit | null =>
  toDigit(cellCode(board, index) & VALUE_MASK)
export const isGiven = (board: Board, index: CellIndex): boolean =>
  (cellCode(board, index) & GIVEN_BIT) !== 0
export const candidatesAt = (board: Board, index: CellIndex): number =>
  (cellCode(board, index) >>> CANDIDATES_SHIFT) & FULL_MASK
export const centersAt = (board: Board, index: CellIndex): number =>
  (cellCode(board, index) >>> CENTERS_SHIFT) & FULL_MASK

export const cellAt = (board: Board, index: CellIndex): Cell => ({
  value: valueAt(board, index),
  given: isGiven(board, index),
  candidates: candidatesAt(board, index),
  centers: centersAt(board, index),
})

export const EMPTY_BOARD: Board = wrap(Array.from({ length: CELL_COUNT }, () => 0))

/** Builds a board from 81 cells, or null for any other count or a mask past nine bits. */
export function boardFromCells(cells: readonly Cell[]): Board | null {
  if (cells.length !== CELL_COUNT) return null
  if (!cells.every((cell) => isMask(cell.candidates) && isMask(cell.centers))) return null
  return wrap(cells.map(pack))
}

/** Copies the board, applies the edit to the copy and wraps it. */
const edit = (board: Board, change: (cells: number[]) => void): Board => {
  const cells = board.cells.slice()
  change(cells)
  return wrap(cells)
}

const write = (cells: number[], index: CellIndex, cell: Cell) => {
  cells[index] = pack(cell)
}

/** Places a digit, clears the cell's notes and removes the digit from every peer's notes. */
export const place = (board: Board, index: CellIndex, digit: Digit): Board =>
  edit(board, (cells) => {
    cells[index] = (cellCode(board, index) & GIVEN_BIT) | digit
    const note = withDigit(EMPTY_MASK, digit)
    const notes = ~((note << CANDIDATES_SHIFT) | (note << CENTERS_SHIFT))
    for (const peer of peersOf(index)) cells[peer] = cellCode(board, peer) & notes
  })

/** Empties a cell of its digit and notes. A given stays marked as one. */
export const clear = (board: Board, index: CellIndex): Board =>
  edit(board, (cells) => {
    write(cells, index, {
      value: null,
      given: isGiven(board, index),
      candidates: EMPTY_MASK,
      centers: EMPTY_MASK,
    })
  })

/** Flips one note. A center note replaces the candidates, which then clear. */
export const toggleMark = (board: Board, index: CellIndex, kind: MarkKind, digit: Digit): Board =>
  edit(board, (cells) => {
    const cell = cellAt(board, index)
    write(
      cells,
      index,
      kind === 'candidate'
        ? { ...cell, candidates: toggleDigit(cell.candidates, digit) }
        : { ...cell, candidates: EMPTY_MASK, centers: toggleDigit(cell.centers, digit) },
    )
  })

/** Writes the given candidates into every empty cell and clears its center notes. */
export const withCandidates = (board: Board, masks: readonly number[]): Board =>
  edit(board, (cells) => {
    for (const index of CELLS) {
      const cell = cellAt(board, index)
      if (cell.value !== null) continue
      write(cells, index, { ...cell, candidates: masks[index] ?? EMPTY_MASK, centers: EMPTY_MASK })
    }
  })

/** Marks every filled cell as given and every empty one as not, as a validated puzzle needs. */
export const withGivens = (board: Board): Board =>
  edit(board, (cells) => {
    for (const index of CELLS) {
      const cell = cellAt(board, index)
      write(cells, index, { ...cell, given: cell.value !== null })
    }
  })

export const changedCells = (a: Board, b: Board): CellIndex[] =>
  a === b ? [] : CELLS.filter((index) => cellCode(a, index) !== cellCode(b, index))

export const boardsEqual = (a: Board, b: Board): boolean =>
  a === b || CELLS.every((index) => cellCode(a, index) === cellCode(b, index))

export const isBoardEmpty = (board: Board): boolean =>
  CELLS.every((index) => valueAt(board, index) === null)
export const isBoardFull = (board: Board): boolean =>
  CELLS.every((index) => valueAt(board, index) !== null)

const BOARD_STRING = /^[0-9.]{81}$/
const EMPTY_CHAR = '.'

/** An 81-character puzzle of digits, with '.' or '0' for an empty cell. */
export const isBoardString = (text: string): boolean => BOARD_STRING.test(text)

/** Parses a puzzle string, every digit in it a given, or null when the string is no puzzle. */
export function parseBoard(text: string): Board | null {
  if (!isBoardString(text)) return null
  return wrap(
    Array.from(text, (char) => {
      const value = toDigit(Number(char))
      return pack({ value, given: value !== null, candidates: EMPTY_MASK, centers: EMPTY_MASK })
    }),
  )
}

/** The digits of a board as a puzzle string, '.' for an empty cell. */
export const boardToString = (board: Board): string =>
  CELLS.map((index) => valueAt(board, index) ?? EMPTY_CHAR).join('')

/** One cell the player just changed, with every cell the change reached, peers that lost notes included. */
export interface BoardMove {
  readonly index: CellIndex
  readonly kind: 'place' | 'mark'
  readonly touched: readonly CellIndex[]
}

/** A placement reaches the cell and at most its peers, so anything wider is a bulk change. */
const MAX_TOUCHED = PEER_COUNT + 1

/** Reads the change between two boards as one move. An erase, an undo of many cells and a new puzzle are none. */
export function findMove(prev: Board, next: Board): BoardMove | null {
  const touched = changedCells(prev, next)
  if (touched.length > MAX_TOUCHED) return null
  const [first, ...rest] = touched
  if (first === undefined) return null
  const [index, ...others] = touched.filter((i) => valueAt(prev, i) !== valueAt(next, i))
  if (index === undefined) return rest.length === 0 ? { index: first, kind: 'mark', touched } : null
  if (others.length > 0 || valueAt(next, index) === null) return null
  return { index, kind: 'place', touched }
}
