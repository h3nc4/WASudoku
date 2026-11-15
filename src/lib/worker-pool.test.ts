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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkerRequest } from '@/workers/protocol'

import { CRASH_MESSAGE, Lane, TASK_TIMEOUT_MS, TIMEOUT_MESSAGE, WorkerPool } from './worker-pool'

const { FakeWorker } = vi.hoisted(() => {
  type Listener = (event: unknown) => void

  /** A worker that records what it is sent and lets a test fire its events. */
  class FakeWorker {
    static readonly created: FakeWorker[] = []
    readonly posted: WorkerRequest[] = []
    readonly terminate = vi.fn()
    private readonly listeners = new Map<string, Listener>()

    constructor() {
      FakeWorker.created.push(this)
    }

    addEventListener(type: string, listener: Listener) {
      this.listeners.set(type, listener)
    }

    postMessage(request: WorkerRequest) {
      this.posted.push(request)
    }

    reply(response: { id: number; status: string; payload?: unknown; error?: string }) {
      this.listeners.get('message')?.({ data: response })
    }

    /** Answers the last request with a success whose payload is given. */
    succeed(payload: unknown) {
      this.reply({ id: this.posted.at(-1)?.id ?? 0, status: 'success', payload })
    }

    fire(type: 'error' | 'messageerror') {
      const event = { preventDefault: vi.fn() }
      this.listeners.get(type)?.(event)
      return event
    }
  }
  return { FakeWorker }
})

vi.mock('@/workers/sudoku.worker?worker', () => ({ default: FakeWorker }))

const SOLVE = { boardString: '...' }
const GENERATE = { difficulty: 'expert' } as const

describe('WorkerPool', () => {
  let pool: WorkerPool

  beforeEach(() => {
    vi.useFakeTimers()
    FakeWorker.created.length = 0
    pool = new WorkerPool()
  })

  afterEach(() => {
    pool.terminate()
    vi.useRealTimers()
  })

  const worker = (n: number) => FakeWorker.created[n]

  it('starts only the foreground worker until a background task arrives', () => {
    expect(FakeWorker.created).toHaveLength(1)

    void pool.runTask('generate', GENERATE, Lane.BACKGROUND)

    expect(FakeWorker.created).toHaveLength(2)
    expect(worker(0).posted).toEqual([])
    expect(worker(1).posted).toEqual([expect.objectContaining({ type: 'generate', ...GENERATE })])
  })

  it('runs a player request at once while the background worker is busy', async () => {
    void pool.runTask('generate', GENERATE, Lane.BACKGROUND)
    const solve = pool.runTask('solve', SOLVE)

    expect(worker(0).posted).toEqual([expect.objectContaining({ type: 'solve', ...SOLVE })])
    worker(0).succeed({ steps: [] })

    await expect(solve).resolves.toEqual({ steps: [] })
  })

  it('runs one task at a time per worker, in order', async () => {
    const first = pool.runTask('solve', SOLVE)
    const second = pool.runTask('validate', SOLVE)
    expect(worker(0).posted).toHaveLength(1)

    worker(0).succeed('first')
    await expect(first).resolves.toBe('first')
    expect(worker(0).posted.map((r) => r.type)).toEqual(['solve', 'validate'])

    worker(0).succeed('second')
    await expect(second).resolves.toBe('second')
  })

  it('rejects with the error the worker reports', async () => {
    const task = pool.runTask('solve', SOLVE)
    worker(0).reply({ id: worker(0).posted[0].id, status: 'error', error: 'No solution' })

    await expect(task).rejects.toThrow('No solution')
  })

  it('ignores a reply to a request it is not running', async () => {
    const task = pool.runTask('solve', SOLVE)
    worker(0).reply({ id: 999, status: 'success', payload: { steps: [] } })
    worker(0).succeed('mine')

    await expect(task).resolves.toBe('mine')
  })

  it('times a stuck task out, replaces its worker and runs the next task on the new one', async () => {
    const stuck = pool.runTask('solve', SOLVE)
    const queued = pool.runTask('validate', SOLVE)
    const rejected = expect(stuck).rejects.toThrow(TIMEOUT_MESSAGE)

    vi.advanceTimersByTime(TASK_TIMEOUT_MS - 1)
    expect(worker(0).terminate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    await rejected
    expect(worker(0).terminate).toHaveBeenCalledOnce()
    expect(worker(1).posted).toEqual([expect.objectContaining({ type: 'validate' })])
    worker(1).succeed('fresh')
    await expect(queued).resolves.toBe('fresh')
  })

  it('clears the timeout once a task answers', async () => {
    const task = pool.runTask('solve', SOLVE)
    worker(0).succeed('done')
    await task

    vi.advanceTimersByTime(TASK_TIMEOUT_MS)

    expect(worker(0).terminate).not.toHaveBeenCalled()
  })

  it.each(['error', 'messageerror'] as const)(
    'rejects the running task and replaces the worker on %s',
    async (type) => {
      const task = pool.runTask('generate', GENERATE, Lane.BACKGROUND)
      const event = worker(1).fire(type)

      await expect(task).rejects.toThrow(CRASH_MESSAGE)
      expect(worker(1).terminate).toHaveBeenCalledOnce()
      if (type === 'error') expect(event.preventDefault).toHaveBeenCalled()

      void pool.runTask('generate', GENERATE, Lane.BACKGROUND)
      expect(worker(2).posted).toEqual([expect.objectContaining({ type: 'generate' })])
    },
  )

  it('replaces an idle worker that crashes only when the next task arrives', () => {
    worker(0).fire('error')
    expect(worker(0).terminate).toHaveBeenCalledOnce()
    expect(FakeWorker.created).toHaveLength(1)

    void pool.runTask('solve', SOLVE)

    expect(FakeWorker.created).toHaveLength(2)
    expect(worker(1).posted).toHaveLength(1)
  })

  it('ignores events from a worker it already replaced', async () => {
    const stuck = pool.runTask('solve', SOLVE)
    const rejected = expect(stuck).rejects.toThrow(TIMEOUT_MESSAGE)
    vi.advanceTimersByTime(TASK_TIMEOUT_MS)
    await rejected
    const next = pool.runTask('solve', SOLVE)

    worker(0).reply({ id: worker(1).posted[0].id, status: 'success', payload: 'late' })
    worker(0).fire('error')
    worker(0).fire('messageerror')
    worker(1).succeed('current')

    await expect(next).resolves.toBe('current')
    expect(worker(1).terminate).not.toHaveBeenCalled()
  })

  it('terminates both workers and drops every task without a timeout left behind', () => {
    const running = vi.fn()
    void pool.runTask('solve', SOLVE).then(running, running)
    void pool.runTask('solve', SOLVE).then(running, running)
    void pool.runTask('generate', GENERATE, Lane.BACKGROUND).then(running, running)

    pool.terminate()

    expect(worker(0).terminate).toHaveBeenCalledOnce()
    expect(worker(1).terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    expect(running).not.toHaveBeenCalled()
  })
})
