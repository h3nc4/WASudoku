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

import {
  type Difficulty,
  EMPTY_POOL,
  type Pool,
  type PooledPuzzle,
  shortDifficulties,
} from '../core/pool'
import type { Cancel } from './deps'

export interface RefillOptions {
  /** Generates one puzzle on the background lane. */
  readonly generate: (difficulty: Difficulty) => Promise<PooledPuzzle>
  /** Adds a round of puzzles to the pool in one update, so one storage write. */
  readonly store: (puzzles: readonly PooledPuzzle[]) => void
  readonly idle: (callback: () => void) => Cancel
  readonly log: (difficulty: Difficulty, reason: unknown) => void
}

export interface Refill {
  /** Records the latest pool and starts a round if the refill runs and a difficulty is short. */
  update(pool: Pool): void
  /** Lets rounds run. Until then the refill only records the pool, so it waits for the first puzzle. */
  start(): void
  /** Puts this difficulty first in the next round, the one the player picked last. */
  prefer(difficulty: Difficulty): void
  dispose(): void
}

/** Tops the pool up in rounds of one puzzle per short difficulty, once the page is idle. */
export function createRefill(options: RefillOptions): Refill {
  let pool = EMPTY_POOL
  let preferred: Difficulty | null = null
  // Generated puzzles the latest recorded pool does not hold yet, and those stored since it came.
  let unstored: PooledPuzzle[] = []
  let stored: PooledPuzzle[] = []
  let started = false
  let running = false
  let disposed = false
  const cancels = new Set<Cancel>()

  const idle = (callback: () => void): void => {
    const cancel = options.idle(() => {
      cancels.delete(cancel)
      callback()
    })
    cancels.add(cancel)
  }

  const ordered = (short: readonly Difficulty[]): Difficulty[] =>
    preferred !== null && short.includes(preferred)
      ? [preferred, ...short.filter((difficulty) => difficulty !== preferred)]
      : [...short]

  function keep(batch: readonly PooledPuzzle[]): void {
    unstored.push(...batch)
    idle(() => {
      unstored = unstored.filter((puzzle) => !batch.includes(puzzle))
      stored.push(...batch)
      options.store(batch)
    })
  }

  function round(): void {
    const short = ordered(shortDifficulties(pool, [...unstored, ...stored]))
    if (short.length === 0) {
      running = false
      return
    }
    // The background lane runs them one at a time. Only the store is shared by the round.
    const attempts = short.map((difficulty) =>
      options.generate(difficulty).catch((reason: unknown) => {
        options.log(difficulty, reason)
        return null
      }),
    )
    void Promise.all(attempts).then((results) => {
      if (disposed) return
      const batch = results.filter((puzzle) => puzzle !== null)
      // A round that failed outright stops here, and the next pool change tries again.
      if (batch.length === 0) {
        running = false
        return
      }
      keep(batch)
      round()
    })
  }

  function kick(): void {
    if (!started || running || disposed) return
    running = true
    idle(round)
  }

  return {
    update(next) {
      pool = next
      stored = []
      kick()
    },
    start() {
      started = true
      kick()
    },
    prefer(difficulty) {
      preferred = difficulty
    },
    dispose() {
      disposed = true
      for (const cancel of cancels) cancel()
      cancels.clear()
    },
  }
}
