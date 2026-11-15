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

import {
  add,
  DIFFICULTIES,
  EMPTY_POOL,
  isDifficulty,
  MAX_POOL_SIZE,
  MIN_POOL_SIZE,
  type Pool,
  type PuzzleData,
  shortDifficulties,
  take,
} from './pool'

const puzzle = (tag: string): PuzzleData => ({ puzzleString: tag, solutionString: tag })

const poolOf = (sizes: Partial<Record<(typeof DIFFICULTIES)[number], number>>): Pool => ({
  ...EMPTY_POOL,
  ...Object.fromEntries(
    Object.entries(sizes).map(([d, n]) => [
      d,
      Array.from({ length: n }, (_, i) => puzzle(`${d}${String(i)}`)),
    ]),
  ),
})

const FULL = Object.fromEntries(DIFFICULTIES.map((d) => [d, MIN_POOL_SIZE]))

describe('pool', () => {
  it('keeps the caps of today', () => {
    expect([MIN_POOL_SIZE, MAX_POOL_SIZE]).toEqual([3, 6])
    expect(DIFFICULTIES).toEqual(['easy', 'medium', 'hard', 'expert', 'extreme'])
  })

  it.each([
    ['easy', true],
    ['extreme', true],
    ['Hard', false],
    [null, false],
  ])('reads %j as a difficulty: %s', (value, expected) => {
    expect(isDifficulty(value)).toBe(expected)
  })

  // Ported from the GENERATE_PUZZLE_START reducer cases.
  it('takes the oldest puzzle and leaves the rest', () => {
    const pool = poolOf({ easy: 2 })
    const taken = take(pool, 'easy')
    expect(taken?.puzzle).toEqual(puzzle('easy0'))
    expect(taken?.pool.easy).toEqual([puzzle('easy1')])
    expect(taken?.pool.hard).toBe(pool.hard)
  })

  it('takes nothing from an empty pool', () => {
    expect(take(EMPTY_POOL, 'hard')).toBeNull()
  })

  // Ported from the POOL_REFILL reducer cases.
  it('should add a round of refilled puzzles to the pool for each difficulty', () => {
    const easy = puzzle('1')
    const hard = puzzle('3')
    const pool = add(EMPTY_POOL, [
      { difficulty: 'easy', ...easy },
      { difficulty: 'hard', ...hard },
      { difficulty: 'easy', ...hard },
    ])
    expect(pool.easy).toEqual([easy, hard])
    expect(pool.hard).toEqual([hard])
    expect(pool.medium).toBe(EMPTY_POOL.medium)
  })

  it('should keep at most MAX_POOL_SIZE puzzles per difficulty', () => {
    const full = poolOf({ expert: MAX_POOL_SIZE })
    const pool = add(full, [{ difficulty: 'expert', ...puzzle('new') }])
    expect(pool.expert).toBe(full.expert)
  })

  // Ported from the refill policy of PoolRefill.
  it('generates only for the difficulties that are short', () => {
    expect(shortDifficulties(poolOf({ ...FULL, hard: MIN_POOL_SIZE - 1 }), [])).toEqual(['hard'])
    expect(shortDifficulties(EMPTY_POOL, [])).toEqual(DIFFICULTIES)
  })

  it('counts puzzles generated but not yet stored, so the next round does not repeat them', () => {
    const pool = poolOf({ ...FULL, easy: MIN_POOL_SIZE - 2 })
    const pending = [{ difficulty: 'easy' as const, ...puzzle('new') }]
    expect(shortDifficulties(pool, pending)).toEqual(['easy'])
    expect(shortDifficulties(pool, [...pending, ...pending])).toEqual([])
  })
})
