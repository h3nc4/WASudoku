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

import { afterEach, describe, expect, it, vi } from 'vitest'

import { PUZZLE, savedGame, STORAGE_KEYS } from '../../e2e/saves'
import { selectGrid, selectMode, selectOffer } from '../core/game/selectors'
import { fakeDeps, MemoryStorage, settle } from '../test/runtime-fakes'
import { type Runtime, startRuntime } from './main'

let runtime: Runtime | null = null

afterEach(() => {
  runtime?.stop()
  runtime = null
  Reflect.deleteProperty(document, 'visibilityState')
})

function start(initial: Record<string, string> = {}, href = 'https://wasudoku.h3nc4.com/') {
  const fakes = fakeDeps({ storage: new MemoryStorage(initial), href })
  runtime = startRuntime({ ...fakes.deps, page: document, window })
  return { ...fakes, runtime }
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('startRuntime', () => {
  it('resumes the saved game', () => {
    const { runtime } = start({ [STORAGE_KEYS.GAME]: savedGame() })
    expect(runtime.store.select(selectMode)()).toBe('playing')
  })

  it('offers a linked puzzle and drops it from the address', () => {
    const { runtime, deps } = start({}, `https://wasudoku.h3nc4.com/?p=${PUZZLE}#top`)
    expect(runtime.store.select(selectOffer)()?.puzzle).toBe(PUZZLE)
    expect(deps.history.replaceState).toHaveBeenCalledWith(
      { kept: true },
      '',
      'https://wasudoku.h3nc4.com/#top',
    )
  })

  it('pauses and saves when the page hides or is left', () => {
    const { runtime, storage } = start({ [STORAGE_KEYS.GAME]: savedGame() })
    const paused = runtime.store.select((state) => selectGrid(state).paused)
    setVisibility('visible')
    expect(paused()).toBe(false)
    storage.writes.length = 0
    setVisibility('hidden')
    expect(paused()).toBe(true)
    expect(storage.writes.map(([key]) => key)).toEqual([STORAGE_KEYS.GAME, STORAGE_KEYS.METRICS])
    runtime.store.dispatch({ type: 'resume' })
    window.dispatchEvent(new Event('pagehide'))
    expect(paused()).toBe(true)
  })

  it('warms the solver once the page is idle', () => {
    const { solver, timers } = start()
    expect(solver.warm).not.toHaveBeenCalled()
    timers.runIdle()
    expect(solver.warm).toHaveBeenCalledTimes(1)
  })

  it('registers the service worker when asked', async () => {
    const fakes = fakeDeps()
    const register = vi.fn(() => Promise.reject(new Error('blocked')))
    const container = { register, controller: null, addEventListener: vi.fn() }
    runtime = startRuntime(
      { ...fakes.deps, page: document, window },
      {
        url: '/sw.js',
        ports: { container, page: document, reload: vi.fn(), log: fakes.deps.log },
        offer: vi.fn(),
      },
    )
    await settle()
    expect(register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' })
    expect(fakes.deps.log.error).toHaveBeenCalledWith(
      'Service worker registration failed:',
      expect.any(Error),
    )
  })

  it('stops listening and cancels the warm-up on stop', () => {
    const {
      runtime: started,
      solver,
      timers,
      storage,
    } = start({ [STORAGE_KEYS.GAME]: savedGame() })
    started.stop()
    runtime = null
    storage.writes.length = 0
    setVisibility('hidden')
    window.dispatchEvent(new Event('pagehide'))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }))
    timers.runIdle()
    expect(storage.writes).toEqual([])
    expect(solver.warm).not.toHaveBeenCalled()
    expect(timers.pendingTimers).toBe(0)
  })
})
