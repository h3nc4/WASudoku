/*
 * Copyright (C) 2026  Henrique Almeida
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

import { describe, expect, it, vi } from 'vitest'

import { add, type Difficulty, EMPTY_POOL, type Pool, type PooledPuzzle } from '../core/pool'
import { FakeTimers, settle } from '../test/runtime-fakes'
import { createRefill } from './refill'

const puzzle = (difficulty: Difficulty): PooledPuzzle => ({
  difficulty,
  puzzleString: '.'.repeat(81),
  solutionString: '1'.repeat(81),
})

const full = (pool: Pool, ...except: Difficulty[]): Pool =>
  add(
    pool,
    (['easy', 'medium', 'hard', 'expert', 'extreme'] as const)
      .filter((difficulty) => !except.includes(difficulty))
      .flatMap((difficulty) => [puzzle(difficulty), puzzle(difficulty), puzzle(difficulty)]),
  )

function setup(generate = vi.fn((difficulty: Difficulty) => Promise.resolve(puzzle(difficulty)))) {
  const timers = new FakeTimers()
  const store = vi.fn()
  const log = vi.fn()
  const refill = createRefill({ generate, store, idle: (callback) => timers.idle(callback), log })
  return { timers, store, log, refill, generate }
}

describe('createRefill', () => {
  it('records pools without generating until it starts', async () => {
    const { refill, timers, generate } = setup()
    refill.update(EMPTY_POOL)
    timers.runIdle()
    await settle()
    expect(generate).not.toHaveBeenCalled()
    refill.start()
    timers.runIdle()
    await settle()
    expect(generate.mock.calls.slice(0, 5)).toEqual([
      ['easy'],
      ['medium'],
      ['hard'],
      ['expert'],
      ['extreme'],
    ])
  })

  it('starts each round with the difficulty picked last', async () => {
    const { refill, timers, generate } = setup()
    refill.prefer('expert')
    refill.update(full(EMPTY_POOL, 'easy', 'expert'))
    refill.start()
    timers.runIdle()
    await settle()
    expect(generate.mock.calls.slice(0, 2)).toEqual([['expert'], ['easy']])
  })

  it('ignores a preferred difficulty that is not short', async () => {
    const { refill, timers, generate } = setup()
    refill.prefer('hard')
    refill.update(full(EMPTY_POOL, 'medium'))
    refill.start()
    timers.runIdle()
    await settle()
    expect(generate.mock.calls[0]).toEqual(['medium'])
  })

  it('stops after a round that failed outright, and the next pool tries again', async () => {
    const generate = vi.fn((difficulty: Difficulty) =>
      difficulty === 'easy'
        ? Promise.reject(new Error('down'))
        : Promise.resolve(puzzle(difficulty)),
    )
    const { refill, timers, log, store } = setup(generate)
    refill.update(full(EMPTY_POOL, 'easy'))
    refill.start()
    timers.runIdle()
    await settle()
    expect(log).toHaveBeenCalledWith('easy', expect.any(Error))
    expect(store).not.toHaveBeenCalled()
    expect(timers.pendingIdles).toBe(0)
    refill.update(full(EMPTY_POOL, 'easy'))
    timers.runIdle()
    await settle()
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('stops once every difficulty is full and does not start a second run while one is going', async () => {
    const { refill, timers, generate, store } = setup()
    refill.start()
    refill.update(full(EMPTY_POOL, 'hard'))
    refill.update(full(EMPTY_POOL, 'hard'))
    for (let round = 0; round < 4; round++) {
      timers.runIdle()
      await settle()
    }
    expect(generate).toHaveBeenCalledTimes(3)
    expect(store).toHaveBeenCalledTimes(3)
    expect(timers.pendingIdles).toBe(0)
  })

  it('counts stored puzzles until a newer pool holds them', async () => {
    const { refill, timers, generate } = setup()
    refill.start()
    refill.update(full(EMPTY_POOL, 'hard'))
    for (let round = 0; round < 4; round++) {
      timers.runIdle()
      await settle()
    }
    expect(generate).toHaveBeenCalledTimes(3)
    refill.update(full(EMPTY_POOL))
    timers.runIdle()
    await settle()
    expect(generate).toHaveBeenCalledTimes(3)
  })

  it('cancels idle work and drops results after dispose', async () => {
    const { refill, timers, generate, store } = setup()
    refill.start()
    refill.update(EMPTY_POOL)
    timers.runIdle()
    refill.dispose()
    await settle()
    timers.runIdle()
    expect(generate).toHaveBeenCalledTimes(5)
    expect(store).not.toHaveBeenCalled()
    refill.update(EMPTY_POOL)
    expect(timers.pendingIdles).toBe(0)
  })

  it('cancels a round still waiting for idle', async () => {
    const { refill, timers, generate } = setup()
    refill.start()
    refill.update(EMPTY_POOL)
    refill.dispose()
    timers.runIdle()
    await settle()
    expect(generate).not.toHaveBeenCalled()
  })
})
