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

import type {
  Requests,
  Responses,
  TaskType,
  WorkerRequest,
  WorkerResponse,
} from '@/workers/protocol'
import SolverWorker from '@/workers/sudoku.worker?worker' // eslint-disable-line import-x/default

// Replaced 'enum' with 'const' object to satisfy 'erasableSyntaxOnly' TS config
export const Priority = {
  HIGH: 0, // User initiated (Solve, Generate Now)
  LOW: 1, // Background (Refill Pool)
} as const

export type Priority = (typeof Priority)[keyof typeof Priority]

export type { TaskType } from '@/workers/protocol'

interface Pending {
  resolve: (value: Responses[TaskType]) => void
  reject: (reason?: unknown) => void
}

interface Task extends Pending {
  request: WorkerRequest
  priority: Priority
  // Receives the results of the copies that lost a race, set only on tasks that may race.
  onSpare?: (value: Responses[TaskType]) => void
}

interface WorkerWrapper {
  id: number
  instance: Worker
  busy: boolean
}

// Bounds on how many workers one raced task runs on, matching the pool's own clamp.
const MIN_RACE_WIDTH = 2
const MAX_RACE_WIDTH = 6

/**
 * Manages a pool of Web Workers to execute heavy Sudoku computations concurrently.
 * Implements priority scheduling to ensure user-initiated actions are processed
 * immediately, while background tasks (like pool refilling) yield resources.
 */
export class WorkerPool {
  private workers: WorkerWrapper[] = []
  private queue: Task[] = []
  private readonly pendingRequests = new Map<number, Pending>()
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
   * @param onSpare Races a HIGH task on every idle worker, resolving with the first success
   * and handing each later success to this callback.
   * @returns A Promise that resolves with the worker's result.
   */
  public runTask<K extends TaskType>(
    type: K,
    payload: Requests[K],
    priority: Priority = Priority.HIGH,
    onSpare?: (value: Responses[K]) => void,
  ): Promise<Responses[K]> {
    return new Promise((resolve, reject) => {
      // WorkerRequest is a union, so TypeScript loses the tie between K and Responses[K] here.
      const request = { id: ++this.idCounter, type, ...payload } as WorkerRequest
      const task: Task = {
        request,
        priority,
        resolve: resolve as Pending['resolve'],
        reject,
        onSpare: onSpare as Task['onSpare'],
      }

      // Add to queue and sort by priority (High priority first)
      this.queue.push(task)
      this.queue.sort((a, b) => a.priority - b.priority)

      this.schedule()
    })
  }

  private schedule() {
    if (this.queue.length === 0) return

    // Find free workers
    const freeWorkers = this.workers.filter((w) => !w.busy)
    if (freeWorkers.length === 0) return

    const nextTask = this.queue[0]

    // Reservation Logic:
    // If the next task is LOW priority, only schedule it if we have > 1 worker free.
    // This reserves at least 1 worker for immediate HIGH priority user interactions.
    // Exception: If the pool only has 1 worker total, we can't reserve.
    if (nextTask.priority === Priority.LOW && freeWorkers.length <= 1 && this.workers.length > 1) {
      return
    }

    // Dequeue and assign
    const task = this.queue.shift()!
    const width = this.raceWidth(task, freeWorkers.length)
    if (width < MIN_RACE_WIDTH) {
      this.post(freeWorkers[0], task.request, task)
    } else {
      this.race(task, freeWorkers.slice(0, width))
    }
  }

  // Two or more free workers mean the queue was empty, since a queued task would hold one,
  // so a race only takes workers that no waiting task wanted.
  private raceWidth(task: Task, freeCount: number): number {
    if (!task.onSpare || task.priority !== Priority.HIGH) return 1
    return Math.min(MAX_RACE_WIDTH, freeCount)
  }

  /** Runs copies of a task at once, resolving with the first success and rejecting only if all fail. */
  private race(task: Task, workers: WorkerWrapper[]) {
    let running = workers.length
    let settled = false
    const copy: Pending = {
      resolve: (value) => {
        running--
        if (settled) {
          task.onSpare?.(value)
        } else {
          settled = true
          task.resolve(value)
        }
      },
      reject: (reason) => {
        running--
        if (!settled && running === 0) task.reject(reason)
      },
    }
    workers.forEach((worker, i) => {
      // Each copy needs its own id, since a response is matched to its request by id alone.
      const id = i === 0 ? task.request.id : ++this.idCounter
      this.post(worker, { ...task.request, id }, copy)
    })
  }

  private post(workerWrapper: WorkerWrapper, request: WorkerRequest, pending: Pending) {
    this.pendingRequests.set(request.id, pending)
    workerWrapper.busy = true
    workerWrapper.instance.postMessage(request)
  }

  private handleMessage(event: MessageEvent<WorkerResponse>) {
    const response = event.data

    // Find the worker that sent this message and mark it free
    const workerInstance = event.target as Worker
    const workerWrapper = this.workers.find((w) => w.instance === workerInstance)

    if (workerWrapper) {
      workerWrapper.busy = false
    }

    const pending = this.pendingRequests.get(response.id)
    if (pending) {
      if (response.status === 'success') {
        pending.resolve(response.payload)
      } else {
        pending.reject(new Error(response.error || 'Unknown worker error'))
      }
      this.pendingRequests.delete(response.id)
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
