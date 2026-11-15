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

import type { CellIndex } from './digits'

/** Side of a box, so a unit holds BOX_SIZE squared cells. */
export const BOX_SIZE = 3
/** Cells in a row, a column or a box, and the count of each. */
export const SIZE = BOX_SIZE * BOX_SIZE
export const CELL_COUNT = SIZE * SIZE
/** Peers of a cell: the rest of its row and column, and the four box cells outside both. */
export const PEER_COUNT = SIZE - 1 + (SIZE - 1) + (BOX_SIZE - 1) * (BOX_SIZE - 1)

export type Direction = 'up' | 'down' | 'left' | 'right'

/** A row, a column or a box, its cells in reading order. */
export type Unit = readonly CellIndex[]

export const isCellIndex = (value: unknown): value is CellIndex =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) < CELL_COUNT

export const toCellIndex = (value: number): CellIndex | null => (isCellIndex(value) ? value : null)

/** Every cell, in reading order. */
export const CELLS: readonly CellIndex[] = Array.from({ length: CELL_COUNT }, (_, i) => i).filter(
  isCellIndex,
)

export const rowOf = (index: CellIndex): number => Math.floor(index / SIZE)
export const colOf = (index: CellIndex): number => index % SIZE
/** Boxes count in reading order too, 0 at the top left and 8 at the bottom right. */
export const boxOf = (index: CellIndex): number =>
  Math.floor(rowOf(index) / BOX_SIZE) * BOX_SIZE + Math.floor(colOf(index) / BOX_SIZE)

/** The cell at a row and a column, or null off the board. */
export const indexAt = (row: number, col: number): CellIndex | null =>
  Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < SIZE && col >= 0 && col < SIZE
    ? toCellIndex(row * SIZE + col)
    : null

const unitsBy = (key: (index: CellIndex) => number): readonly Unit[] =>
  Array.from({ length: SIZE }, (_, k) => CELLS.filter((index) => key(index) === k))

export const ROWS = unitsBy(rowOf)
export const COLS = unitsBy(colOf)
export const BOXES = unitsBy(boxOf)
/** Rows, then columns, then boxes. */
export const UNITS: readonly Unit[] = [...ROWS, ...COLS, ...BOXES]

/** Reads a per-cell table, where a stray index gets the fallback rather than undefined. */
export const lookup = <T>(table: readonly T[], index: number, fallback: T): T =>
  table[index] ?? fallback

const NO_UNIT: Unit = []
const UNITS_OF = CELLS.map((index) => [
  lookup(ROWS, rowOf(index), NO_UNIT),
  lookup(COLS, colOf(index), NO_UNIT),
  lookup(BOXES, boxOf(index), NO_UNIT),
])

/** The row, column and box of a cell, in that order. */
export const unitsOf = (index: CellIndex): readonly Unit[] => lookup(UNITS_OF, index, [])

export const isPeer = (a: CellIndex, b: CellIndex): boolean =>
  a !== b && (rowOf(a) === rowOf(b) || colOf(a) === colOf(b) || boxOf(a) === boxOf(b))

const PEERS = CELLS.map((index) => CELLS.filter((other) => isPeer(index, other)))

/** The 20 cells that share a unit with this one, in reading order, the cell itself left out. */
export const peersOf = (index: CellIndex): Unit => lookup(PEERS, index, NO_UNIT)

const STEP: Readonly<Record<Direction, number>> = { up: -SIZE, down: SIZE, left: -1, right: 1 }

/** The next cell in reading order, so left and right wrap between rows, or null past an edge. */
export const neighbour = (index: CellIndex, direction: Direction): CellIndex | null =>
  toCellIndex(index + STEP[direction])
