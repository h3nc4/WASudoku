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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DIFFICULTIES,
  type Difficulty,
  type PooledPuzzle,
  type PuzzleData,
} from '@/context/sudoku.types'

import { MIN_POOL_SIZE, PoolRefill } from './pool-refill'

type Pool = Record<Difficulty, PuzzleData[]>

const puzzle = (tag: string): PuzzleData => ({ puzzleString: tag, solutionString: tag })

const poolOf = (counts: Partial<Record<Difficulty, number>> = {}): Pool =>
  Object.fromEntries(
    DIFFICULTIES.map((d) => [d, Array.from({ length: counts[d] ?? 0 }, () => puzzle(d))]),
  ) as Pool

const FULL = Object.fromEntries(DIFFICULTIES.map((d) => [d, MIN_POOL_SIZE]))

describe('PoolRefill', () => {
  let idle: (() => void)[]
  let generate: ReturnType<typeof vi.fn<(d: Difficulty) => Promise<PuzzleData>>>
  let store: ReturnType<typeof vi.fn<(puzzles: PooledPuzzle[]) => void>>
  let refill: PoolRefill
  let pool: Pool

  /** Runs the idle callbacks queued so far, as the browser would once the page settles. */
  const runIdle = () => idle.splice(0).forEach((callback) => callback())

  /** Lets the pending generate promises settle, then runs what they queued for idle time. */
  const settle = async () => {
    await vi.waitFor(() => expect(idle.length).toBeGreaterThan(0))
    runIdle()
  }

  beforeEach(() => {
    idle = []
    pool = poolOf()
    generate = vi.fn((d: Difficulty) => Promise.resolve(puzzle(`new-${d}`)))
    // The state takes each stored round and hands the new pool back, as the hook does.
    store = vi.fn((puzzles: PooledPuzzle[]) => {
      pool = { ...pool }
      puzzles.forEach(({ difficulty, ...data }) => (pool[difficulty] = [...pool[difficulty], data]))
      refill.update(pool)
    })
    refill = new PoolRefill({
      generate,
      store,
      schedule: (callback) => {
        idle.push(callback)
        return () => idle.splice(idle.indexOf(callback), 1)
      },
    })
  })

  afterEach(() => {
    refill.dispose()
  })

  it('waits for idle time before generating', () => {
    refill.update(pool)

    expect(generate).not.toHaveBeenCalled()
    runIdle()
    expect(generate).toHaveBeenCalledTimes(DIFFICULTIES.length)
  })

  it('fills every difficulty once before any gets a second puzzle, one store per round', async () => {
    refill.update(pool)
    runIdle()

    expect(generate.mock.calls.map(([d]) => d)).toEqual([...DIFFICULTIES])
    await vi.waitFor(() => expect(idle).toHaveLength(MIN_POOL_SIZE))
    runIdle()

    expect(store.mock.calls.map(([round]) => round.map((p) => p.difficulty))).toEqual(
      Array.from({ length: MIN_POOL_SIZE }, () => [...DIFFICULTIES]),
    )
    expect(generate).toHaveBeenCalledTimes(MIN_POOL_SIZE * DIFFICULTIES.length)
    expect(DIFFICULTIES.map((d) => pool[d].length)).toEqual(DIFFICULTIES.map(() => MIN_POOL_SIZE))
  })

  it('generates only for the difficulties that are short', () => {
    refill.update(poolOf({ ...FULL, hard: MIN_POOL_SIZE - 1 }))
    runIdle()

    expect(generate.mock.calls).toEqual([['hard']])
  })

  /** Makes generate wait. The returned function resolves the oldest pending call. */
  const holdGenerate = () => {
    const answers: (() => void)[] = []
    generate.mockImplementation(
      (d) => new Promise((resolve) => answers.push(() => resolve(puzzle(`new-${d}`)))),
    )
    return async () => {
      answers.shift()?.()
      await new Promise((resolve) => setTimeout(resolve))
    }
  }

  it('counts puzzles generated but not yet stored, so the next round does not repeat them', async () => {
    const answer = holdGenerate()
    refill.update(poolOf({ ...FULL, easy: MIN_POOL_SIZE - 2 }))
    runIdle()
    await answer()
    await answer()

    expect(generate.mock.calls).toEqual([['easy'], ['easy']])
    expect(store).not.toHaveBeenCalled()
  })

  it('counts a stored round until the state hands back a pool holding it', async () => {
    store.mockImplementation(() => {})
    const answer = holdGenerate()
    refill.update(poolOf({ ...FULL, easy: MIN_POOL_SIZE - 2 }))
    runIdle()
    await answer()
    runIdle()
    expect(store).toHaveBeenCalledOnce()
    await answer()

    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('does nothing more while a refill is running', () => {
    refill.update(pool)
    refill.update(pool)

    expect(idle).toHaveLength(1)
  })

  it('logs a failed generate, keeps the rest of the round and retries the failed one', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    generate.mockRejectedValueOnce(new Error('timed out'))
    refill.update(poolOf({ ...FULL, easy: MIN_POOL_SIZE - 1, hard: MIN_POOL_SIZE - 1 }))
    runIdle()
    await settle()

    expect(error).toHaveBeenCalledWith('Background refill failed for easy:', expect.any(Error))
    expect(store.mock.calls[0][0].map((p) => p.difficulty)).toEqual(['hard'])
    expect(generate.mock.calls.at(-1)).toEqual(['easy'])
    error.mockRestore()
  })

  it('stops after a round that failed outright and starts again on the next pool change', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    generate.mockRejectedValue(new Error('crashed'))
    refill.update(poolOf({ ...FULL, easy: 0 }))
    runIdle()
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce())
    await new Promise((resolve) => setTimeout(resolve))

    expect(generate).toHaveBeenCalledOnce()
    expect(idle).toHaveLength(0)
    refill.update(poolOf({ ...FULL, easy: 0 }))
    expect(idle).toHaveLength(1)
    error.mockRestore()
  })

  it('cancels idle work and drops results that arrive after dispose', async () => {
    refill.update(pool)
    runIdle()
    refill.dispose()
    await new Promise((resolve) => setTimeout(resolve))

    expect(idle).toHaveLength(0)
    expect(store).not.toHaveBeenCalled()
  })

  it('cancels a refill that has not started yet', () => {
    refill.update(pool)
    refill.dispose()

    expect(idle).toHaveLength(0)
  })
})
