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

import type { CellIndex } from './digits'
import {
  BOX_SIZE,
  BOXES,
  boxOf,
  CELL_COUNT,
  CELLS,
  colOf,
  COLS,
  type Direction,
  indexAt,
  isCellIndex,
  isPeer,
  lookup,
  neighbour,
  PEER_COUNT,
  peersOf,
  rowOf,
  ROWS,
  SIZE,
  toCellIndex,
  UNITS,
  unitsOf,
} from './geometry'

const at = (n: number) => n as CellIndex

describe('geometry', () => {
  it('names the board size', () => {
    expect([BOX_SIZE, SIZE, CELL_COUNT, PEER_COUNT]).toEqual([3, 9, 81, 20])
  })

  it('lists every cell in reading order', () => {
    expect(CELLS).toEqual(Array.from({ length: 81 }, (_, i) => i))
  })

  it.each([0, 40, 80])('accepts cell %i', (value) => {
    expect(isCellIndex(value)).toBe(true)
    expect(toCellIndex(value)).toBe(value)
  })

  it.each([-1, 81, 2.5, Number.NaN])('rejects cell %d', (value) => {
    expect(isCellIndex(value)).toBe(false)
    expect(toCellIndex(value)).toBeNull()
  })

  it('finds the row, column and box of a cell', () => {
    expect([rowOf(at(0)), colOf(at(0)), boxOf(at(0))]).toEqual([0, 0, 0])
    expect([rowOf(at(10)), colOf(at(10)), boxOf(at(10))]).toEqual([1, 1, 0])
    expect([rowOf(at(33)), colOf(at(33)), boxOf(at(33))]).toEqual([3, 6, 5])
    expect([rowOf(at(80)), colOf(at(80)), boxOf(at(80))]).toEqual([8, 8, 8])
  })

  it('finds the cell at a row and a column', () => {
    expect(indexAt(0, 0)).toBe(0)
    expect(indexAt(3, 6)).toBe(33)
    expect(indexAt(8, 8)).toBe(80)
  })

  it.each([
    [-1, 0],
    [0, 9],
    [9, 0],
    [0, -1],
    [0.5, 0],
    [0, 0.5],
  ])('finds no cell at row %d, column %d', (row, col) => {
    expect(indexAt(row, col)).toBeNull()
  })

  it('builds 27 units of nine, each cell in three of them', () => {
    expect(ROWS[1]).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17])
    expect(COLS[2]).toEqual([2, 11, 20, 29, 38, 47, 56, 65, 74])
    expect(BOXES[4]).toEqual([30, 31, 32, 39, 40, 41, 48, 49, 50])
    expect(UNITS).toHaveLength(27)
    expect(UNITS.every((unit) => unit.length === 9)).toBe(true)
    for (const cell of CELLS) {
      expect(UNITS.filter((unit) => unit.includes(cell))).toHaveLength(3)
    }
  })

  it('gives the row, column and box through a cell, in that order', () => {
    expect(unitsOf(at(33))).toEqual([ROWS[3], COLS[6], BOXES[5]])
  })

  // Ported from getRelatedCellIndices, which also counted the cell itself.
  it('returns the correct peers for a corner cell', () => {
    const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 19, 20, 27, 36, 45, 54, 63, 72]
    expect(peersOf(at(0))).toEqual(expected)
    expect(peersOf(at(0))).toHaveLength(PEER_COUNT)
  })

  it('gives every cell 20 peers, none of them itself', () => {
    for (const cell of CELLS) {
      const peers = peersOf(cell)
      expect(peers).toHaveLength(PEER_COUNT)
      expect(peers).not.toContain(cell)
      expect(peers.every((peer) => isPeer(cell, peer) && isPeer(peer, cell))).toBe(true)
    }
  })

  it('reads a box neighbour as a peer and a far cell as none', () => {
    expect(isPeer(at(0), at(20))).toBe(true)
    expect(isPeer(at(0), at(30))).toBe(false)
    expect(isPeer(at(4), at(4))).toBe(false)
  })

  it('returns no peers and no units for an out-of-bounds index', () => {
    expect(peersOf(at(-1))).toEqual([])
    expect(peersOf(at(81))).toEqual([])
    expect(unitsOf(at(81))).toEqual([])
  })

  it('reads a table with a fallback past its end', () => {
    expect(lookup(['a', 'b'], 1, 'z')).toBe('b')
    expect(lookup(['a', 'b'], 2, 'z')).toBe('z')
  })

  // Ported from the NAVIGATE reducer cases.
  it.each([
    ['right', 0, 1],
    ['left', 1, 0],
    ['down', 0, 9],
    ['up', 9, 0],
    ['right', 8, 9],
    ['left', 9, 8],
  ] as [Direction, number, number][])('moves %s from %i to %i', (direction, from, to) => {
    expect(neighbour(at(from), direction)).toBe(to)
  })

  it.each([
    ['right', 80],
    ['left', 0],
    ['down', 72],
    ['up', 8],
  ] as [Direction, number][])('stays put moving %s at the edge from %i', (direction, from) => {
    expect(neighbour(at(from), direction)).toBeNull()
  })
})
