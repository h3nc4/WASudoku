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

import { browserDeps, browserTimers, IDLE_FALLBACK_MS, IDLE_TIMEOUT_MS } from './browser'

afterEach(() => {
  vi.useRealTimers()
})

describe('browserTimers', () => {
  it('runs and cancels timeouts', () => {
    vi.useFakeTimers()
    const timers = browserTimers(globalThis)
    const ran = vi.fn()
    timers.timeout(ran, 100)
    const cancel = timers.timeout(ran, 100)
    cancel()
    vi.advanceTimersByTime(100)
    expect(ran).toHaveBeenCalledTimes(1)
  })

  it('waits for idle with a deadline where the browser has idle callbacks', () => {
    const requestIdleCallback = vi.fn(() => 5)
    const cancelIdleCallback = vi.fn()
    const timers = browserTimers({
      setTimeout,
      clearTimeout,
      requestIdleCallback,
      cancelIdleCallback,
    })
    const callback = vi.fn()
    timers.idle(callback)()
    expect(requestIdleCallback).toHaveBeenCalledWith(callback, { timeout: IDLE_TIMEOUT_MS })
    expect(cancelIdleCallback).toHaveBeenCalledWith(5)
  })

  it('falls back to a short timeout without idle callbacks', () => {
    vi.useFakeTimers()
    const timers = browserTimers({ setTimeout, clearTimeout })
    const callback = vi.fn()
    timers.idle(callback)
    vi.advanceTimersByTime(IDLE_FALLBACK_MS - 1)
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalled()
  })
})

describe('browserDeps', () => {
  it('takes every port from the page', () => {
    const toast = vi.fn()
    const solver = { run: vi.fn(), warm: vi.fn(), dispose: vi.fn() }
    const deps = browserDeps(window, toast, solver)
    expect(deps.storage).toBe(window.localStorage)
    expect(deps.location).toBe(window.location)
    expect(deps.history).toBe(window.history)
    expect(deps.page).toBe(document)
    expect(deps.window).toBe(window)
    expect(deps.solver).toBe(solver)
    expect(deps.toast).toBe(toast)
    expect(deps.log).toBe(console)
    expect(deps.clipboard).toBe(navigator.clipboard)
    expect(deps.now()).toBeGreaterThanOrEqual(0)
    const seed = deps.seed()
    expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true)
  })

  it('makes its own solver client by default', () => {
    expect(typeof browserDeps(window, vi.fn()).solver.run).toBe('function')
  })
})
