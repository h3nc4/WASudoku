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

import SolverWorker from '@/workers/sudoku.worker?worker' // eslint-disable-line import-x/default

// Replaced 'enum' with 'const' object to satisfy 'erasableSyntaxOnly' TS config
export const Priority = {
  HIGH: 0, // User initiated (Solve, Generate Now)
  LOW: 1, // Background (Refill Pool)
} as const

export type Priority = (typeof Priority)[keyof typeof Priority]

export type TaskType = 'solve' | 'generate' | 'validate'

interface Task<T = unknown> {
  id: number
  type: TaskType
  payload: unknown
  priority: Priority
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

interface WorkerWrapper {
  id: number
  instance: Worker
  busy: boolean
}

/**
 * Manages a pool of Web Workers to execute heavy Sudoku computations concurrently.
 * Implements priority scheduling to ensure user-initiated actions are processed
 * immediately, while background tasks (like pool refilling) yield resources.
 */
export class WorkerPool {
  private workers: WorkerWrapper[] = []
  private queue: Task[] = []
  private readonly pendingRequests = new Map<
    number,
    { resolve: (val: unknown) => void; reject: (err: unknown) => void }
  >()
  private idCounter = 0
  private readonly maxWorkers: number

  constructor() {
    // Clamp concurrency between 2 and 6.
    // Min 2: Ensure we can solve and gen in background simultaneously.
    // Max 6: Prevent consuming too many resources on high-core CPUs.
    const concurrency = navigator.hardwareConcurrency || 4
    this.maxWorkers = Math.max(2, Math.min(6, concurrency))

    this.initialize()
  }

  private initialize() {
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new SolverWorker()
      worker.addEventListener('message', this.handleMessage.bind(this))
      this.workers.push({ id: i, instance: worker, busy: false })
    }
  }

  /**
   * Schedules a task to be run on the worker pool.
   * @param type The operation type (solve, generate, validate).
   * @param payload Data required for the operation.
   * @param priority Execution priority.
   * @returns A Promise that resolves with the worker's result.
   */
  public runTask<T>(
    type: TaskType,
    payload: unknown,
    priority: Priority = Priority.HIGH,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++this.idCounter
      const task: Task<T> = {
        id,
        type,
        payload,
        priority,
        resolve,
        reject,
      }

      // Add to queue and sort by priority (High priority first)
      this.queue.push(task as Task<unknown>)
      this.queue.sort((a, b) => a.priority - b.priority)

      this.schedule()
    })
  }

  private schedule() {
    if (this.queue.length === 0) return

    // Find a free worker
    const freeWorkerIndex = this.workers.findIndex((w) => !w.busy)
    if (freeWorkerIndex === -1) return

    const nextTask = this.queue[0]
    const freeWorkersCount = this.workers.filter((w) => !w.busy).length

    // Reservation Logic:
    // If the next task is LOW priority, only schedule it if we have > 1 worker free.
    // This reserves at least 1 worker for immediate HIGH priority user interactions.
    // Exception: If the pool only has 1 worker total, we can't reserve.
    if (nextTask.priority === Priority.LOW && freeWorkersCount <= 1 && this.workers.length > 1) {
      return
    }

    // Dequeue and assign
    const task = this.queue.shift()!
    const workerWrapper = this.workers[freeWorkerIndex]

    this.pendingRequests.set(task.id, {
      resolve: task.resolve,
      reject: task.reject,
    })

    workerWrapper.busy = true
    workerWrapper.instance.postMessage({
      id: task.id,
      type: task.type,
      ...(task.payload as object),
    })
  }

  private handleMessage(event: MessageEvent) {
    const { id, status, payload, error } = event.data

    // Find the worker that sent this message and mark it free
    const workerInstance = event.target as Worker
    const workerWrapper = this.workers.find((w) => w.instance === workerInstance)

    if (workerWrapper) {
      workerWrapper.busy = false
    }

    const pending = this.pendingRequests.get(id)
    if (pending) {
      if (status === 'success') {
        pending.resolve(payload)
      } else {
        pending.reject(new Error(error || 'Unknown worker error'))
      }
      this.pendingRequests.delete(id)
    }

    // Try to schedule next task
    this.schedule()
  }

  public terminate() {
    this.workers.forEach((w) => w.instance.terminate())
    this.workers = []
    this.pendingRequests.clear()
    this.queue = []
  }
}
