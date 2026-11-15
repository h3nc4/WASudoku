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
import type * as Wire from '../core/codec/wire.types'
import type { Digit } from '../core/digits'
import {
  type CellView,
  type PadKey,
  sameCellView,
  selectCell,
  selectCells,
  selectControls,
  selectGrid,
  selectHint,
  selectMode,
  selectOffer,
  selectPad,
  selectSeconds,
  selectStatus,
  selectWalkthrough,
  selectWin,
} from '../core/game/selectors'
import type { State } from '../core/game/state'
import { CELLS } from '../core/geometry'
import {
  cellsOf,
  decoded,
  fakeDeps,
  fakeSolver,
  MemoryStorage,
  settle,
} from '../test/runtime-fakes'
import { watch } from './signals'
import { loadSlices } from './storage'
import { createStore } from './store'

const DOTS = PUZZLE.replaceAll('0', '.')

function loadedStore(initial: Record<string, string>, solver = fakeSolver()) {
  const fakes = fakeDeps({ storage: new MemoryStorage(initial), solver })
  const store = createStore(fakes.deps)
  store.dispatch({ type: 'loaded', slices: loadSlices(fakes.storage, fakes.deps.log) })
  return { ...fakes, store }
}

const shallow = <T extends object | null>(a: T, b: T): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    Object.keys(a).every((key) => Object.is(Reflect.get(a, key), Reflect.get(b, key))))

const sameCell = (a: CellView | undefined, b: CellView | undefined): boolean =>
  a === b || (a !== undefined && b !== undefined && sameCellView(a, b))

const samePad = (a: readonly PadKey[], b: readonly PadKey[]): boolean =>
  a.every((key, i) => shallow(key, b[i] ?? null))

describe('createStore', () => {
  it('starts on the selection screen and runs each event through update', () => {
    const { store } = loadedStore({})
    const mode = store.select(selectMode)
    expect(mode()).toBe('selecting')
    store.dispatch({ type: 'enterCustom' })
    expect(mode()).toBe('entering')
  })

  it('notifies a watcher only when the selected output changes', () => {
    const { store } = loadedStore({})
    const mode = store.select(selectMode)
    const runs = vi.fn()
    watch(() => {
      runs(mode())
    })
    store.dispatch({ type: 'cycleMode' })
    store.dispatch({ type: 'enterCustom' })
    store.dispatch({ type: 'enterCustom' })
    expect(runs.mock.calls).toEqual([['selecting'], ['entering']])
  })

  it('keeps the last output while `equals` says the new one is the same', () => {
    const { store } = loadedStore({})
    const input = store.select(
      (state: State) => ({ mode: state.input.mode }),
      (a, b) => a.mode === b.mode,
    )
    const first = input()
    store.dispatch({ type: 'enterCustom' })
    expect(input()).toBe(first)
    store.dispatch({ type: 'cycleMode' })
    expect(input()).toEqual({ mode: 'candidate' })
  })

  it('reruns on a tick only the selectors that declare `now`', () => {
    const { store, timers } = loadedStore({ [STORAGE_KEYS.GAME]: savedGame() })
    const clock = vi.fn(selectSeconds)
    const status = vi.fn((state: State) => selectStatus(state))
    const seconds = store.select((state, now) => clock(state, now))
    const bar = store.select((state) => status(state))
    watch(() => {
      seconds()
      bar()
    })
    clock.mockClear()
    status.mockClear()
    timers.advance(1000)
    expect(seconds()).toBe(1)
    expect(clock).toHaveBeenCalledTimes(1)
    expect(status).not.toHaveBeenCalled()
  })

  it('tells the time through the now port', () => {
    const { store, timers } = loadedStore({})
    timers.time = 1234
    expect(store.now()).toBe(1234)
  })

  it('starts the background refill only once the first puzzle shows, with its difficulty first', async () => {
    const solver = fakeSolver((task) =>
      Promise.resolve(
        task.kind === 'generate'
          ? decoded<Wire.GenerateResult>({
              kind: 'generated',
              difficulty: task.difficulty,
              puzzle: cellsOf(DOTS),
              solution: cellsOf(SOLUTION),
            })
          : decoded({ kind: 'several' }),
      ),
    )
    const { store, timers } = loadedStore({}, solver)
    timers.runIdle()
    await settle()
    expect(solver.calls).toEqual([])
    store.dispatch({ type: 'newGame', difficulty: 'hard' })
    expect(solver.calls.map(({ options }) => options?.lane)).toEqual([undefined])
    await settle()
    expect(store.select(selectMode)()).toBe('playing')
    timers.runIdle()
    await settle()
    const background = solver.calls.filter(({ options }) => options?.lane === 'background')
    expect(
      background.slice(0, 5).map(({ task }) => task.kind === 'generate' && task.difficulty),
    ).toEqual(['hard', 'easy', 'medium', 'expert', 'extreme'])
  })

  it('stops its timers on dispose', () => {
    const { store, timers } = loadedStore({ [STORAGE_KEYS.GAME]: savedGame() })
    expect(timers.pendingTimers).toBe(1)
    store.dispose()
    expect(timers.pendingTimers).toBe(0)
  })
})

/** A board's worth of bindings, each counting how often its watcher runs. */
function bindAll(store: ReturnType<typeof createStore>) {
  const runs = new Map<string, number>()
  const count = (name: string, read: () => unknown) =>
    watch(() => {
      read()
      runs.set(name, (runs.get(name) ?? 0) + 1)
    })
  for (const index of CELLS)
    count(
      `cell ${String(index)}`,
      store.select((state) => selectCell(state, index), sameCell),
    )
  count('pad', store.select(selectPad, samePad))
  count('seconds', store.select(selectSeconds))
  count('status', store.select(selectStatus, shallow))
  count('controls', store.select(selectControls, shallow))
  count('grid', store.select(selectGrid, shallow))
  count('mode', store.select(selectMode))
  count('hint', store.select(selectHint))
  count('walkthrough', store.select(selectWalkthrough, shallow))
  count('offer', store.select(selectOffer, shallow))
  count('win', store.select(selectWin, shallow))
  const state = store.select((value: State) => value)
  return {
    state,
    /** The watchers that ran during `act`, each with its count. */
    measure: (act: () => void): Map<string, number> => {
      runs.clear()
      act()
      return new Map(runs)
    },
  }
}

const changedCells = (before: State, after: State): string[] =>
  CELLS.filter((index) => !sameCellView(selectCells(before)[index], selectCells(after)[index])).map(
    (index) => `cell ${String(index)}`,
  )

describe('watcher runs on a full board', () => {
  const setup = () => {
    const loaded = loadedStore({
      [STORAGE_KEYS.GAME]: savedGame(),
      [STORAGE_KEYS.POOL]: fullPool(),
    })
    return { ...loaded, ...bindAll(loaded.store) }
  }

  it('wakes only the clock text on a tick', () => {
    const { timers, measure } = setup()
    expect([
      ...measure(() => {
        timers.advance(1000)
      }),
    ]).toEqual([['seconds', 1]])
  })

  it('wakes only the cells a selection changed', () => {
    const { store, state, measure } = setup()
    const before = state()
    const ran = measure(() => {
      store.dispatch({ type: 'select', index: CELLS[2] })
    })
    const changed = changedCells(before, state())
    expect([...ran.keys()].sort()).toEqual([...changed, 'controls'].sort())
    expect(changed).toHaveLength(21)
  })

  it('wakes only the cells a digit changed, the pad counts and the controls it enabled', () => {
    const { store, state, measure } = setup()
    store.dispatch({ type: 'select', index: CELLS[2] })
    const before = state()
    const ran = measure(() => {
      store.dispatch({ type: 'digit', digit: Number(SOLUTION[2]) as Digit })
    })
    const changed = changedCells(before, state())
    expect([...ran.keys()].sort()).toEqual([...changed, 'pad', 'controls'].sort())
    expect([...ran.values()].every((times) => times === 1)).toBe(true)
    // The placed cell, and the two given 4s that now share its shading.
    expect(changed).toHaveLength(3)
  })

  it('wakes only the changed cells and the pad on a second digit', () => {
    const { store, state, measure } = setup()
    store.dispatch({ type: 'select', index: CELLS[2] })
    store.dispatch({ type: 'digit', digit: 4 })
    store.dispatch({ type: 'select', index: CELLS[3] })
    const before = state()
    const ran = measure(() => {
      store.dispatch({ type: 'digit', digit: 6 })
    })
    const changed = changedCells(before, state())
    expect([...ran.keys()].sort()).toEqual([...changed, 'pad'].sort())
  })
})
