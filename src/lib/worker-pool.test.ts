/*
 * Copyright (C) 2025  Henrique Almeida
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

import { Priority, type TaskType, WorkerPool } from './worker-pool'

// Hoist mocks
const { MockWorker, mockPostMessage, mockTerminate, mockAddEventListener } = vi.hoisted(() => {
  const mockPostMessage = vi.fn()
  const mockTerminate = vi.fn()
  const mockAddEventListener = vi.fn()
  const mockRemoveEventListener = vi.fn()

  const MockWorker = vi.fn(function () {
    return {
      postMessage: mockPostMessage,
      terminate: mockTerminate,
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
    }
  })

  return {
    MockWorker,
    mockPostMessage,
    mockTerminate,
    mockAddEventListener,
    mockRemoveEventListener,
  }
})

vi.stubGlobal('Worker', MockWorker)

// Mock the module import used by WorkerPool
vi.mock('@/workers/sudoku.worker?worker', () => ({
  default: MockWorker,
}))

// Mock navigator.hardwareConcurrency
const mockNavigator = {
  hardwareConcurrency: 4,
}
vi.stubGlobal('navigator', mockNavigator)

describe('WorkerPool', () => {
  let pool: WorkerPool

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset hardwareConcurrency to default for tests
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      value: 4,
      configurable: true,
    })
    pool = new WorkerPool()
  })

  afterEach(() => {
    pool?.terminate()
  })

  it('initializes the correct number of workers based on hardwareConcurrency', () => {
    // Default 4 -> Clamped to max 6, min 2. Should be 4.
    expect(MockWorker).toHaveBeenCalledTimes(4)
  })

  it('clamps worker count to minimum 2', () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 1 })
    pool.terminate() // Clear previous pool
    pool = new WorkerPool()
    expect(MockWorker).toHaveBeenCalledTimes(2 + 4) // 4 from beforeEach + 2 new
  })

  it('clamps worker count to maximum 6', () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 32 })
    pool.terminate()
    pool = new WorkerPool()
    expect(MockWorker).toHaveBeenCalledTimes(6 + 4)
  })

  it('defaults to 4 workers if hardwareConcurrency is unavailable', () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: undefined })
    pool.terminate()
    pool = new WorkerPool()
    // Defaults to 4, which is within clamp (2-6)
    expect(MockWorker).toHaveBeenCalledTimes(4 + 4)
  })

  it('executes a high priority task immediately if workers are free', async () => {
    const promise = pool.runTask('solve', { board: '...' }, Priority.HIGH)

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'solve',
        board: '...',
      }),
    )

    // Simulate worker response
    const taskId = mockPostMessage.mock.calls[0][0].id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageHandler = mockAddEventListener.mock.calls[0][1] as (event: any) => void
    const workerInstance = MockWorker.mock.results[0].value

    messageHandler({
      data: { id: taskId, status: 'success', payload: 'solved' },
      target: workerInstance,
    })

    await expect(promise).resolves.toBe('solved')
  })

  it('handles task with no payload (coverage for || {})', async () => {
    const promise = pool.runTask('solve', null, Priority.HIGH)

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'solve',
        // Should not have other payload props, effectively just type and id
      }),
    )

    const taskId = mockPostMessage.mock.calls[0][0].id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageHandler = mockAddEventListener.mock.calls[0][1] as (event: any) => void
    const workerInstance = MockWorker.mock.results[0].value

    messageHandler({
      data: { id: taskId, status: 'success', payload: 'done' },
      target: workerInstance,
    })

    await expect(promise).resolves.toBe('done')
  })

  it('queues low priority tasks if not enough workers are free (reservation logic)', () => {
    // Simulate all but 1 worker busy. Pool size 4.
    // We need > 1 free worker to schedule low priority.
    // If we make 3 workers busy, 1 is free. Low priority should queue.

    // 1. Occupy 3 workers with High Priority tasks
    pool.runTask('solve', {}, Priority.HIGH)
    pool.runTask('solve', {}, Priority.HIGH)
    pool.runTask('solve', {}, Priority.HIGH)

    // 2. Schedule Low Priority task
    pool.runTask('generate', {}, Priority.LOW)

    // Only the first 3 high priority tasks should have been sent
    expect(mockPostMessage).toHaveBeenCalledTimes(3)
  })

  it('executes queued tasks when a worker becomes free', async () => {
    // 1. Saturate the pool
    const p1 = pool.runTask('solve' as TaskType, {}, Priority.HIGH)
    pool.runTask('solve' as TaskType, {}, Priority.HIGH)
    pool.runTask('solve' as TaskType, {}, Priority.HIGH)
    pool.runTask('solve' as TaskType, {}, Priority.HIGH)

    // 2. Add queued task
    const pQueued = pool.runTask('generate' as TaskType, {}, Priority.HIGH)

    expect(mockPostMessage).toHaveBeenCalledTimes(4)

    // 3. Resolve first task to free up a worker
    const id1 = mockPostMessage.mock.calls[0][0].id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageHandler = mockAddEventListener.mock.calls[0][1] as (event: any) => void
    const workerInstance = MockWorker.mock.results[0].value

    messageHandler({
      data: { id: id1, status: 'success', payload: 'done1' },
      target: workerInstance,
    })

    await p1

    // 4. Expect queued task to be sent now
    expect(mockPostMessage).toHaveBeenCalledTimes(5)
    expect(mockPostMessage.mock.calls[4][0].type).toBe('generate')

    // Resolve queued task
    const idQueued = mockPostMessage.mock.calls[4][0].id
    messageHandler({
      data: { id: idQueued, status: 'success', payload: 'doneQueued' },
      target: workerInstance,
    })
    await expect(pQueued).resolves.toBe('doneQueued')
  })

  it('handles worker errors correctly', async () => {
    const promise = pool.runTask('solve', {}, Priority.HIGH)
    const id = mockPostMessage.mock.calls[0][0].id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageHandler = mockAddEventListener.mock.calls[0][1] as (event: any) => void

    messageHandler({
      data: { id, status: 'error', error: 'Boom' },
      target: MockWorker.mock.results[0].value,
    })

    await expect(promise).rejects.toThrow('Boom')
  })

  it('handles "unknown worker error" fallback', async () => {
    const promise = pool.runTask('solve', {}, Priority.HIGH)
    const id = mockPostMessage.mock.calls[0][0].id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageHandler = mockAddEventListener.mock.calls[0][1] as (event: any) => void

    // Send error without message
    messageHandler({
      data: { id, status: 'error', error: undefined },
      target: MockWorker.mock.results[0].value,
    })

    await expect(promise).rejects.toThrow('Unknown worker error')
  })

  it('ignores messages for unknown task IDs', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageHandler = mockAddEventListener.mock.calls[0][1] as (event: any) => void

    // Simulate message for ID 999 (orphan ID)
    expect(() => {
      messageHandler({
        data: { id: 999, status: 'success', payload: 'ok' },
        target: MockWorker.mock.results[0].value,
      })
    }).not.toThrow()
  })

  it('handles missing worker instance in handleMessage (coverage)', async () => {
    // This is a defensive case where the event target doesn't match any known worker
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messageHandler = mockAddEventListener.mock.calls[0][1] as (event: any) => void

    // Create a fake worker object that isn't in our pool
    const unknownWorker = { some: 'object' }

    // Start a task so we have a pending request
    const promise = pool.runTask('solve', {}, Priority.HIGH)
    const id = mockPostMessage.mock.calls[0][0].id

    // Send message from unknown worker
    // This should NOT throw, and since it doesn't find the worker wrapper,
    // it just skips setting busy=false on any wrapper, but still resolves the promise.
    expect(() => {
      messageHandler({
        data: { id, status: 'success', payload: 'ok' },
        target: unknownWorker,
      })
    }).not.toThrow()

    // The promise should still resolve based on the task ID
    await expect(promise).resolves.toBe('ok')
  })

  it('terminates all workers on terminate()', () => {
    pool.terminate()
    expect(mockTerminate).toHaveBeenCalledTimes(4)
  })
})
