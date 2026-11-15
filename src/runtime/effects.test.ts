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

import { fullPool, PUZZLE, savedGame, SOLUTION, STORAGE_KEYS } from '../../e2e/saves'
import { parseBoard } from '../core/board'
import type { StorageKey } from '../core/codec/storage'
import type * as Wire from '../core/codec/wire.types'
import type { Effect } from '../core/game/effects'
import type { Event } from '../core/game/events'
import { INITIAL_STATE, type State } from '../core/game/state'
import { update } from '../core/game/update'
import { SolverError } from '../solver/client'
import {
  cellsOf,
  decoded,
  fakeDeps,
  fakeSolver,
  MemoryStorage,
  settle,
} from '../test/runtime-fakes'
import { createEffects } from './effects'
import { loadSlices } from './storage'

const DOTS = PUZZLE.replaceAll('0', '.')

/** A game loaded from the e2e save, one move past the puzzle, its clock running. */
function playing(): State {
  const storage = new MemoryStorage({
    [STORAGE_KEYS.GAME]: savedGame(),
    [STORAGE_KEYS.POOL]: fullPool(),
  })
  return update(INITIAL_STATE, { type: 'loaded', slices: loadSlices(storage, console) }, 0).state
}

function setup(options: Parameters<typeof fakeDeps>[0] = {}, state: State = playing()) {
  const fakes = fakeDeps(options)
  const events: Event[] = []
  let current = state
  const effects = createEffects(
    fakes.deps,
    (event) => {
      events.push(event)
    },
    () => current,
  )
  const set = (next: State) => {
    current = next
  }
  return { ...fakes, effects, events, set }
}

const save = (key: StorageKey, when: 'idle' | 'now'): Effect => ({ kind: 'save', key, when })

describe('save', () => {
  it('writes the key from the state of the moment it runs', () => {
    const { effects, storage, timers } = setup()
    effects.run(save(STORAGE_KEYS.METRICS, 'now'))
    expect(storage.items.get(STORAGE_KEYS.METRICS)).toBe('{"timer":0,"mistakes":0}')
    timers.time = 2500
    effects.run(save(STORAGE_KEYS.GAME, 'now'))
    expect(storage.items.get(STORAGE_KEYS.GAME)).toBe(savedGame())
  })

  it('waits for idle, and an idle save already queued absorbs the next one', () => {
    const { effects, storage, timers, set } = setup()
    effects.run(save(STORAGE_KEYS.POOL, 'idle'))
    effects.run(save(STORAGE_KEYS.POOL, 'idle'))
    expect(storage.writes).toEqual([])
    expect(timers.pendingIdles).toBe(1)
    set({ ...playing(), pool: { easy: [], medium: [], hard: [], expert: [], extreme: [] } })
    timers.runIdle()
    expect(storage.writes).toEqual([
      [
        STORAGE_KEYS.POOL,
        '{"puzzlePool":{"easy":[],"medium":[],"hard":[],"expert":[],"extreme":[]}}',
      ],
    ])
  })

  it('writes at once and drops the idle save of the same key', () => {
    const { effects, storage, timers } = setup()
    effects.run(save(STORAGE_KEYS.GAME, 'idle'))
    effects.run(save(STORAGE_KEYS.GAME, 'now'))
    timers.runIdle()
    expect(storage.writes).toHaveLength(1)
  })

  it('writes nothing for the selection screen, which is never a game', () => {
    const { effects, storage } = setup({}, INITIAL_STATE)
    effects.run(save(STORAGE_KEYS.GAME, 'now'))
    expect(storage.writes).toEqual([])
  })

  it('writes a given text at once, whatever the state holds', () => {
    const { effects, storage } = setup({}, INITIAL_STATE)
    effects.run({ kind: 'write', key: STORAGE_KEYS.METRICS, text: '{"timer":30,"mistakes":2}' })
    expect(storage.writes).toEqual([[STORAGE_KEYS.METRICS, '{"timer":30,"mistakes":2}']])
  })

  it('logs a write the storage refuses', () => {
    const storage = new MemoryStorage()
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
    const { effects, deps } = setup({ storage })
    effects.run(save(STORAGE_KEYS.METRICS, 'now'))
    expect(deps.log.error).toHaveBeenCalledWith(
      `Could not save ${STORAGE_KEYS.METRICS}:`,
      expect.any(DOMException),
    )
  })
})

describe('tick', () => {
  it('keeps one timer, replaced by each tick and stopped by null', () => {
    const { effects, timers, events } = setup()
    effects.run({ kind: 'tick', delayMs: 1000 })
    effects.run({ kind: 'tick', delayMs: 300 })
    expect(timers.pendingTimers).toBe(1)
    timers.advance(300)
    expect(events).toEqual([{ type: 'tick' }])
    effects.run({ kind: 'tick', delayMs: 1000 })
    effects.run({ kind: 'tick', delayMs: null })
    timers.advance(5000)
    expect(events).toHaveLength(1)
    effects.run({ kind: 'tick', delayMs: null })
    expect(timers.pendingTimers).toBe(0)
  })
})

describe('solver', () => {
  const unique = decoded<Wire.ValidateResult>({ kind: 'unique', solution: cellsOf(SOLUTION) })

  it('runs the task on the foreground lane and answers with the mapped reply', async () => {
    const solver = fakeSolver(() => Promise.resolve(unique))
    const { effects, events } = setup({ solver })
    effects.run({ kind: 'solver', id: 4, task: { kind: 'validate', puzzle: DOTS } })
    expect(solver.calls[0]?.task).toEqual({ kind: 'validate', cells: cellsOf(DOTS) })
    expect(solver.calls[0]?.options?.signal).toBeInstanceOf(AbortSignal)
    expect(solver.calls[0]?.options?.lane).toBeUndefined()
    await settle()
    expect(events).toEqual([{ type: 'validated', id: 4, solution: parseBoard(SOLUTION) }])
  })

  it('seeds a generate from the seed port', () => {
    const solver = fakeSolver()
    const { effects } = setup({ solver })
    effects.run({ kind: 'solver', id: 1, task: { kind: 'generate', difficulty: 'hard' } })
    expect(solver.calls[0]?.task).toEqual({ kind: 'generate', difficulty: 'hard', seed: 7 })
  })

  it.each([
    ['a rejected SolverError', () => Promise.reject(new SolverError('timeout')), 'timeout'],
    ['any other rejection', () => Promise.reject(new TypeError('boom')), 'TypeError: boom'],
    [
      'bytes that failed to decode',
      () => Promise.resolve({ ok: false, error: 'truncated' }),
      'truncated',
    ],
    [
      'a result of kind error',
      () => Promise.resolve(decoded({ kind: 'error', error: 'noSolution' })),
      'noSolution',
    ],
  ])('answers %s with failed', async (_, answer, reason) => {
    const { effects, events } = setup({ solver: fakeSolver(answer) })
    effects.run({ kind: 'solver', id: 9, task: { kind: 'solve', puzzle: DOTS } })
    await settle()
    expect(events).toEqual([{ type: 'failed', id: 9, reason }])
  })

  it('cancels through the abort signal and stays quiet about the cancel', async () => {
    let signal: AbortSignal | undefined
    const solver = fakeSolver((_, options) => {
      signal = options?.signal
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new SolverError('aborted'))
        })
      })
    })
    const { effects, events, deps } = setup({ solver })
    effects.run({ kind: 'solver', id: 2, task: { kind: 'solve', puzzle: DOTS } })
    effects.run({ kind: 'cancel', id: 2 })
    effects.run({ kind: 'cancel', id: 2 })
    await settle()
    expect(signal?.aborted).toBe(true)
    expect(events).toEqual([])
    expect(deps.log.error).not.toHaveBeenCalled()
  })

  it('drops replies that arrive after dispose', async () => {
    let resolve: (value: unknown) => void = () => undefined
    const solver = fakeSolver(
      () =>
        new Promise((_resolve) => {
          resolve = _resolve
        }),
    )
    const { effects, events } = setup({ solver })
    effects.run({ kind: 'solver', id: 1, task: { kind: 'validate', puzzle: DOTS } })
    effects.dispose()
    resolve(unique)
    await settle()
    expect(events).toEqual([])
  })
})

describe('refill', () => {
  const generated = (difficulty: Wire.Difficulty) =>
    decoded<Wire.GenerateResult>({
      kind: 'generated',
      difficulty,
      puzzle: cellsOf(DOTS),
      solution: cellsOf(SOLUTION),
    })

  it('generates on the background lane once started, and stores each round in one event', async () => {
    const solver = fakeSolver((task) =>
      Promise.resolve(task.kind === 'generate' ? generated(task.difficulty) : null),
    )
    const { effects, events, timers } = setup({ solver })
    effects.run({
      kind: 'refill',
      pool: { easy: [], medium: [], hard: [], expert: [], extreme: [] },
    })
    timers.runIdle()
    expect(solver.calls).toEqual([])
    effects.refill.start()
    timers.runIdle()
    await settle()
    for (let round = 0; round < 3; round++) {
      timers.runIdle()
      await settle()
    }
    // Puzzles waiting to be stored count toward the pool, so three rounds fill it to three each.
    expect(solver.calls.map(({ options }) => options?.lane)).toEqual(Array(15).fill('background'))
    expect(events).toHaveLength(3)
    expect(events[0]).toEqual({
      type: 'refilled',
      puzzles: ['easy', 'medium', 'hard', 'expert', 'extreme'].map((difficulty) => ({
        difficulty,
        puzzleString: DOTS,
        solutionString: SOLUTION,
      })),
    })
  })

  it('logs a failed background generate', async () => {
    const solver = fakeSolver(() =>
      Promise.resolve(decoded({ kind: 'error', error: 'searchLimit' })),
    )
    const { effects, timers, deps } = setup({ solver })
    effects.refill.start()
    effects.run({
      kind: 'refill',
      pool: { easy: [], medium: [], hard: [], expert: [], extreme: [] },
    })
    timers.runIdle()
    await settle()
    expect(deps.log.error).toHaveBeenCalledWith(
      'Background refill failed for easy:',
      expect.any(Error),
    )
  })
})

describe('toast, copy and the address', () => {
  it('hands a toast to the sink by id and tone', () => {
    const { effects, deps } = setup()
    effects.run({ kind: 'toast', message: 'noHint', tone: 'error' })
    expect(deps.toast).toHaveBeenCalledWith('noHint', 'error')
  })

  it('copies text and confirms with the effect message', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    const { effects, deps } = setup({ clipboard: { writeText } })
    effects.run({ kind: 'copy', text: DOTS, message: 'exported' })
    await settle()
    expect(writeText).toHaveBeenCalledWith(DOTS)
    expect(deps.toast).toHaveBeenCalledWith('exported', 'success')
  })

  it('reports a refused copy and a missing clipboard', async () => {
    const refused = setup({ clipboard: { writeText: () => Promise.reject(new Error('denied')) } })
    refused.effects.run({ kind: 'copy', text: DOTS, message: 'linkCopied' })
    await settle()
    expect(refused.deps.toast).toHaveBeenCalledWith('copyFailed', 'error')
    const missing = setup({ clipboard: undefined })
    missing.effects.run({ kind: 'copy', text: DOTS, message: 'linkCopied' })
    expect(missing.deps.toast).toHaveBeenCalledWith('clipboardUnavailable', 'error')
  })

  it('replaces the address and keeps the history state', () => {
    const { effects, deps } = setup()
    effects.run({ kind: 'replaceUrl', href: 'https://wasudoku.h3nc4.com/?x=1' })
    expect(deps.history.replaceState).toHaveBeenCalledWith(
      { kept: true },
      '',
      'https://wasudoku.h3nc4.com/?x=1',
    )
  })
})

describe('flash', () => {
  it('ends each pulse after its delay', () => {
    const { effects, events, timers } = setup()
    effects.run({ kind: 'flash', pulse: 1, delayMs: 600 })
    effects.run({ kind: 'flash', pulse: 2, delayMs: 600 })
    timers.advance(600)
    expect(events).toEqual([
      { type: 'flashEnded', pulse: 1 },
      { type: 'flashEnded', pulse: 2 },
    ])
  })
})

describe('corrupt', () => {
  it('logs each unreadable key once', () => {
    const { effects, deps } = setup()
    effects.run({ kind: 'corrupt', key: STORAGE_KEYS.GAME, reason: 'Bad board' })
    effects.run({ kind: 'corrupt', key: STORAGE_KEYS.GAME, reason: 'Bad board' })
    effects.run({ kind: 'corrupt', key: STORAGE_KEYS.POOL, reason: 'Bad pool' })
    expect(deps.log.error.mock.calls).toEqual([
      [`Kept the unreadable ${STORAGE_KEYS.GAME}:`, 'Bad board'],
      [`Kept the unreadable ${STORAGE_KEYS.POOL}:`, 'Bad pool'],
    ])
  })
})

describe('dispose', () => {
  it('stops the clock, pending saves, flashes and requests', () => {
    let signal: AbortSignal | undefined
    const solver = fakeSolver((_, options) => {
      signal = options?.signal
      return new Promise(() => undefined)
    })
    const { effects, events, timers, storage } = setup({ solver })
    effects.run({ kind: 'tick', delayMs: 1000 })
    effects.run({ kind: 'flash', pulse: 1, delayMs: 600 })
    effects.run(save(STORAGE_KEYS.GAME, 'idle'))
    effects.run({ kind: 'solver', id: 3, task: { kind: 'solve', puzzle: DOTS } })
    effects.dispose()
    timers.advance(5000)
    timers.runIdle()
    expect(events).toEqual([])
    expect(storage.writes).toEqual([])
    expect(signal?.aborted).toBe(true)
  })
})
