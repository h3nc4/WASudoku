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

import { computed, endBatch, signal, startBatch } from 'alien-signals'

import type { Event } from '../core/game/events'
import { INITIAL_STATE, playOf, type State } from '../core/game/state'
import { update } from '../core/game/update'
import type { RuntimeDeps } from './deps'
import { createEffects } from './effects'
import type { Read } from './signals'

export interface Store {
  dispatch(event: Event): void
  // Recomputed after each update, and on a tick only when the selector declares `now`.
  // An output `equals` to the last one keeps it, so no watcher of it runs.
  select<T>(selector: (state: State, now: number) => T, equals?: (a: T, b: T) => boolean): Read<T>
  now(): number
}

/** The store behind `createStore`, with the teardown the page entry needs and the UI does not. */
export interface RuntimeStore extends Store {
  dispose(): void
}

export function createStore(deps: RuntimeDeps): RuntimeStore {
  let state = INITIAL_STATE
  let lastNow = deps.now()
  const current = signal(state)
  const clock = signal(lastNow)
  let refillStarted = false
  const effects = createEffects(deps, dispatch, () => state)

  function dispatch(event: Event): void {
    const now = deps.now()
    const outcome = update(state, event, now)
    state = outcome.state
    lastNow = now
    startBatch()
    current(state)
    clock(now)
    endBatch()
    if (event.type === 'newGame') effects.refill.prefer(event.difficulty)
    for (const effect of outcome.effects) effects.run(effect)
    // The background worker starts only once a puzzle shows, so it never delays the first one.
    if (!refillStarted && playOf(state.game) !== null) {
      refillStarted = true
      effects.refill.start()
    }
  }

  function select<T>(
    selector: (state: State, now: number) => T,
    equals: (a: T, b: T) => boolean = Object.is,
  ): Read<T> {
    const readsClock = selector.length > 1
    let last: { readonly value: T } | null = null
    return computed(() => {
      const value = selector(current(), readsClock ? clock() : lastNow)
      if (last !== null && equals(last.value, value)) return last.value
      last = { value }
      return value
    })
  }

  return {
    dispatch,
    select,
    now: () => deps.now(),
    dispose: () => {
      effects.dispose()
    },
  }
}
