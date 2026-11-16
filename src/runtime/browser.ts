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

import { createSolverClient, type SolverClient } from '../solver/client'
import type { Timers, ToastSink } from './deps'
import type { PageDeps } from './main'
import { pageStorage } from './storage'

/** How long an idle callback may wait before it runs anyway. */
export const IDLE_TIMEOUT_MS = 1000
/** The delay before an idle save runs where the browser has no idle callback, such as Safari. */
export const IDLE_FALLBACK_MS = 200
/** Seeds span 32 bits, which the generator takes whole. */
const SEED_RANGE = 0x1_00_00_00_00

type TimerScope = Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'> &
  Partial<Pick<typeof globalThis, 'requestIdleCallback' | 'cancelIdleCallback'>>

export function browserTimers(scope: TimerScope): Timers {
  const timeout = (callback: () => void, delayMs: number) => {
    const id = scope.setTimeout(callback, delayMs)
    return () => {
      scope.clearTimeout(id)
    }
  }
  const { requestIdleCallback, cancelIdleCallback } = scope
  return {
    timeout,
    idle:
      requestIdleCallback === undefined || cancelIdleCallback === undefined
        ? (callback) => timeout(callback, IDLE_FALLBACK_MS)
        : (callback) => {
            const id = requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS })
            return () => {
              cancelIdleCallback(id)
            }
          },
  }
}

/** The ports of a real page. The toast sink comes from the UI, since the UI maps ids to text. */
export function browserDeps(
  scope: Window & typeof globalThis,
  toast: ToastSink,
  solver: SolverClient = createSolverClient(),
): PageDeps {
  return {
    storage: pageStorage(scope),
    timers: browserTimers(scope),
    solver,
    clipboard: scope.navigator.clipboard,
    location: scope.location,
    history: scope.history,
    now: () => scope.performance.now(),
    toast,
    log: scope.console,
    seed: () => Math.floor(scope.Math.random() * SEED_RANGE),
    page: scope.document,
    window: scope,
  }
}
