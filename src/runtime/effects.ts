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

import type { StorageKey } from '../core/codec/storage'
import type { Effect } from '../core/game/effects'
import type { Event } from '../core/game/events'
import { serialize } from '../core/game/persist'
import type { RequestId, State } from '../core/game/state'
import { SolverError } from '../solver/client'
import type { Cancel, RuntimeDeps } from './deps'
import { createRefill, type Refill } from './refill'
import { generatePooled, runTask, toReply } from './results'
import { writeKey } from './storage'

export interface Effects {
  run(effect: Effect): void
  /** The pool refill, which the store starts once the first puzzle shows. */
  readonly refill: Refill
  /** Stops every timer and request, and drops replies still to come. */
  dispose(): void
}

/** The reason a rejected task gives the game, or null for a cancel the game asked for itself. */
function rejection(error: unknown): string | null {
  if (!(error instanceof SolverError)) return String(error)
  return error.reason === 'aborted' ? null : error.reason
}

/** Performs the core's effects. Replies and timers come back as events through `dispatch`. */
export function createEffects(
  deps: RuntimeDeps,
  dispatch: (event: Event) => void,
  read: () => State,
): Effects {
  const idleSaves = new Map<StorageKey, Cancel>()
  const requests = new Map<RequestId, AbortController>()
  const flashes = new Set<Cancel>()
  const corrupted = new Set<StorageKey>()
  let tick: Cancel | null = null
  let disposed = false

  const send = (event: Event): void => {
    if (!disposed) dispatch(event)
  }

  const refill = createRefill({
    generate: (difficulty) => generatePooled(deps.solver, difficulty, deps.seed()),
    store: (puzzles) => {
      send({ type: 'refilled', puzzles })
    },
    idle: (callback) => deps.timers.idle(callback),
    log: (difficulty, reason) => {
      deps.log.error(`Background refill failed for ${difficulty}:`, reason)
    },
  })

  function write(key: StorageKey): void {
    const text = serialize(read(), key, deps.now())
    if (text !== null) writeKey(deps.storage, key, text, deps.log)
  }

  function save(key: StorageKey, when: 'idle' | 'now'): void {
    const pending = idleSaves.get(key)
    if (when === 'idle') {
      if (pending !== undefined) return
      const cancel = deps.timers.idle(() => {
        idleSaves.delete(key)
        write(key)
      })
      idleSaves.set(key, cancel)
      return
    }
    pending?.()
    idleSaves.delete(key)
    write(key)
  }

  function solve(id: RequestId, task: Extract<Effect, { kind: 'solver' }>['task']): void {
    const controller = new AbortController()
    requests.set(id, controller)
    const forget = (): void => {
      requests.delete(id)
    }
    runTask(deps.solver, task, deps.seed, { signal: controller.signal }).then(
      (answer) => {
        forget()
        send(toReply(id, answer))
      },
      (error: unknown) => {
        forget()
        const reason = rejection(error)
        if (reason === null) return
        deps.log.error('Solver task failed:', error)
        send({ type: 'failed', id, reason })
      },
    )
  }

  function copy(text: string, message: Extract<Effect, { kind: 'copy' }>['message']): void {
    const { clipboard } = deps
    if (clipboard === undefined) {
      deps.toast('clipboardUnavailable', 'error')
      return
    }
    clipboard.writeText(text).then(
      () => {
        deps.toast(message, 'success')
      },
      () => {
        deps.toast('copyFailed', 'error')
      },
    )
  }

  function flash(pulse: number, delayMs: number): void {
    const cancel = deps.timers.timeout(() => {
      flashes.delete(cancel)
      send({ type: 'flashEnded', pulse })
    }, delayMs)
    flashes.add(cancel)
  }

  function run(effect: Effect): void {
    switch (effect.kind) {
      case 'save':
        save(effect.key, effect.when)
        return
      case 'tick':
        tick?.()
        tick =
          effect.delayMs === null
            ? null
            : deps.timers.timeout(() => {
                tick = null
                send({ type: 'tick' })
              }, effect.delayMs)
        return
      case 'solver':
        solve(effect.id, effect.task)
        return
      case 'cancel':
        requests.get(effect.id)?.abort()
        requests.delete(effect.id)
        return
      case 'refill':
        refill.update(effect.pool)
        return
      case 'toast':
        deps.toast(effect.message, effect.tone)
        return
      case 'copy':
        copy(effect.text, effect.message)
        return
      case 'flash':
        flash(effect.pulse, effect.delayMs)
        return
      case 'replaceUrl':
        deps.history.replaceState(deps.history.state, '', effect.href)
        return
      case 'corrupt':
        if (corrupted.has(effect.key)) return
        corrupted.add(effect.key)
        deps.log.error(`Kept the unreadable ${effect.key}:`, effect.reason)
    }
  }

  return {
    run,
    refill,
    dispose() {
      disposed = true
      tick?.()
      tick = null
      for (const cancel of [...idleSaves.values(), ...flashes]) cancel()
      idleSaves.clear()
      flashes.clear()
      for (const controller of requests.values()) controller.abort()
      requests.clear()
      refill.dispose()
    },
  }
}
