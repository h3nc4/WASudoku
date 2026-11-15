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

import {
  DIFFICULTIES,
  type Difficulty,
  type PooledPuzzle,
  type PuzzleData,
} from '@/context/sudoku.types'

/** Puzzles kept ready per difficulty, so a new game rarely waits for the generator. */
export const MIN_POOL_SIZE = 3

type Pool = Readonly<Record<Difficulty, readonly PuzzleData[]>>

const EMPTY_POOL: Pool = { easy: [], medium: [], hard: [], expert: [], extreme: [] }

export interface PoolRefillOptions {
  readonly generate: (difficulty: Difficulty) => Promise<PuzzleData>
  /** Adds a round of puzzles to the pool in one state update and one storage write. */
  readonly store: (puzzles: PooledPuzzle[]) => void
  /** Runs main-thread work once the page is idle and returns a canceller. */
  readonly schedule: (callback: () => void) => () => void
}

/** Tops the pool up in rounds of one puzzle per short difficulty, once the page is idle. */
export class PoolRefill {
  private readonly options: PoolRefillOptions
  private pool = EMPTY_POOL
  // Generated puzzles the pool passed to update() does not hold yet.
  private unstored: PooledPuzzle[] = []
  private stored: PooledPuzzle[] = []
  private running = false
  private disposed = false
  private readonly cancels = new Set<() => void>()

  constructor(options: PoolRefillOptions) {
    this.options = options
  }

  /** Records the pool from the latest state and starts a refill if any difficulty is short. */
  update(pool: Pool) {
    this.pool = pool
    this.stored = []
    if (this.running) return
    this.running = true
    this.idle(() => this.round())
  }

  dispose() {
    this.disposed = true
    this.cancels.forEach((cancel) => cancel())
    this.cancels.clear()
  }

  private idle(callback: () => void) {
    const cancel = this.options.schedule(() => {
      this.cancels.delete(cancel)
      callback()
    })
    this.cancels.add(cancel)
  }

  private short(): Difficulty[] {
    const pending = [...this.unstored, ...this.stored]
    return DIFFICULTIES.filter(
      (d) => this.pool[d].length + pending.filter((p) => p.difficulty === d).length < MIN_POOL_SIZE,
    )
  }

  private round() {
    const short = this.short()
    if (short.length === 0) {
      this.running = false
      return
    }
    // The background worker runs these one at a time. Only the store is shared by the round.
    void Promise.allSettled(short.map((d) => this.options.generate(d))).then((results) => {
      if (this.disposed) return
      const batch: PooledPuzzle[] = []
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') batch.push({ difficulty: short[i], ...result.value })
        else console.error(`Background refill failed for ${short[i]}:`, result.reason)
      })
      // A round that failed outright stops here, and the next pool change tries again.
      if (batch.length === 0) {
        this.running = false
        return
      }
      this.unstored.push(...batch)
      this.idle(() => {
        this.unstored = this.unstored.filter((puzzle) => !batch.includes(puzzle))
        this.stored.push(...batch)
        this.options.store(batch)
      })
      this.round()
    })
  }
}
