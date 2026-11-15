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

import { vi } from 'vitest'

import type * as Wire from '../core/codec/wire.types'
import type { Decoded } from '../core/codec/wire.types'
import type { KeyValueStore, RuntimeDeps, Timers } from '../runtime/deps'
import type { RunOptions, SolverClient, Task } from '../solver/client'

/** A `localStorage` stand-in that records every write in order. */
export class MemoryStorage implements KeyValueStore {
  readonly items = new Map<string, string>()
  readonly writes: [key: string, value: string][] = []

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.items.set(key, value)
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value)
    this.writes.push([key, value])
  }
}

interface Scheduled {
  readonly at: number
  readonly order: number
  readonly callback: () => void
}

/** Timers on a clock the test moves, with idle callbacks that run only when it says so. */
export class FakeTimers implements Timers {
  time = 0
  private order = 0
  private timers = new Set<Scheduled>()
  private idles = new Set<() => void>()

  timeout(callback: () => void, delayMs: number) {
    const entry = { at: this.time + delayMs, order: this.order++, callback }
    this.timers.add(entry)
    return () => {
      this.timers.delete(entry)
    }
  }

  idle(callback: () => void) {
    const entry = () => {
      callback()
    }
    this.idles.add(entry)
    return () => {
      this.idles.delete(entry)
    }
  }

  get pendingTimers(): number {
    return this.timers.size
  }

  get pendingIdles(): number {
    return this.idles.size
  }

  /** Moves the clock on, firing each timer due on the way at its own time. */
  advance(ms: number): void {
    const end = this.time + ms
    for (;;) {
      const next = [...this.timers]
        .filter((entry) => entry.at <= end)
        .sort((a, b) => a.at - b.at || a.order - b.order)[0]
      if (next === undefined) break
      this.timers.delete(next)
      this.time = next.at
      next.callback()
    }
    this.time = end
  }

  /** Runs every idle callback, including those queued while running them. */
  runIdle(): void {
    while (this.idles.size > 0) {
      const batch = [...this.idles]
      this.idles.clear()
      for (const callback of batch) callback()
    }
  }
}

type Answer = (task: Task, options: RunOptions | undefined) => Promise<unknown>

/** A solver client that answers through `answer`, recording each task and its options. */
export function fakeSolver(answer: Answer = () => new Promise(() => undefined)) {
  const calls: { task: Task; options: RunOptions | undefined }[] = []
  const run = vi.fn((task: Task, options?: RunOptions) => {
    calls.push({ task, options })
    return answer(task, options)
  })
  return {
    calls,
    run: run as unknown as SolverClient['run'],
    runs: run,
    warm: vi.fn(),
    dispose: vi.fn(),
  }
}

export const decoded = <T>(result: T): Decoded<T> => ({ ok: true, result })

export const cellsOf = (text: string): Wire.Cells =>
  Uint8Array.from(text, (char) => (char === '.' ? 0 : Number(char)))

/** Resolves after every queued promise reaction has run. */
export const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

export interface Fakes {
  readonly storage: MemoryStorage
  readonly timers: FakeTimers
  readonly solver: ReturnType<typeof fakeSolver>
  readonly deps: RuntimeDeps & {
    readonly toast: ReturnType<typeof vi.fn>
    readonly log: { readonly error: ReturnType<typeof vi.fn> }
    readonly history: { readonly state: unknown; readonly replaceState: ReturnType<typeof vi.fn> }
  }
}

/** Every runtime port as a fake, each one reachable for assertions. */
export function fakeDeps(
  options: {
    storage?: MemoryStorage
    solver?: ReturnType<typeof fakeSolver>
    clipboard?: RuntimeDeps['clipboard']
    href?: string
  } = {},
): Fakes {
  const storage = options.storage ?? new MemoryStorage()
  const timers = new FakeTimers()
  const solver = options.solver ?? fakeSolver()
  const href = options.href ?? 'https://wasudoku.h3nc4.com/'
  const deps = {
    storage,
    timers,
    solver,
    clipboard:
      'clipboard' in options ? options.clipboard : { writeText: vi.fn(() => Promise.resolve()) },
    location: { search: new URL(href).search, href },
    history: { state: { kept: true }, replaceState: vi.fn() },
    now: () => timers.time,
    toast: vi.fn(),
    log: { error: vi.fn() },
    seed: () => 7,
  }
  return { storage, timers, solver, deps }
}
