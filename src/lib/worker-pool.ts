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

/** The worker a task runs on, so a player's request never queues behind a background refill. */
export const Lane = {
  FOREGROUND: 'foreground',
  BACKGROUND: 'background',
} as const

export type Lane = (typeof Lane)[keyof typeof Lane]

export type { TaskType } from '@/workers/protocol'

/** Longest a task may run before its worker is replaced. Expert peaks near 2 s on a desktop. */
export const TASK_TIMEOUT_MS = 30_000

export const TIMEOUT_MESSAGE = 'The solver took too long and was restarted.'
export const CRASH_MESSAGE = 'The solver stopped unexpectedly and was restarted.'

interface Task {
  request: WorkerRequest
  resolve: (value: Responses[TaskType]) => void
  reject: (reason: Error) => void
}

interface Running {
  task: Task
  timer: ReturnType<typeof setTimeout>
}

/** One worker running one task at a time from its own queue. */
class WorkerLane {
  private worker: Worker | null = null
  private running: Running | null = null
  private queue: Task[] = []

  /** Starts the worker ahead of its first task, so that task skips the wasm compile. */
  warm() {
    this.worker ??= this.spawn()
  }

  run(task: Task) {
    this.queue.push(task)
    this.next()
  }

  /** Stops the worker and drops every task without settling it. */
  dispose() {
    this.worker?.terminate()
    this.worker = null
    if (this.running) clearTimeout(this.running.timer)
    this.running = null
    this.queue = []
  }

  private spawn(): Worker {
    const worker = new SolverWorker()
    const current = () => this.worker === worker
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      if (current()) this.settle(event.data)
    })
    worker.addEventListener('error', (event) => {
      event.preventDefault()
      if (current()) this.fail(new Error(CRASH_MESSAGE))
    })
    worker.addEventListener('messageerror', () => {
      if (current()) this.fail(new Error(CRASH_MESSAGE))
    })
    return worker
  }

  private next() {
    if (this.running) return
    const task = this.queue.shift()
    if (!task) return
    this.worker ??= this.spawn()
    const timer = setTimeout(() => this.fail(new Error(TIMEOUT_MESSAGE)), TASK_TIMEOUT_MS)
    this.running = { task, timer }
    this.worker.postMessage(task.request)
  }

  private settle(response: WorkerResponse) {
    const running = this.running
    if (running?.task.request.id !== response.id) return
    this.finish(running)
    if (response.status === 'success') running.task.resolve(response.payload)
    else running.task.reject(new Error(response.error))
  }

  // Wasm cannot be interrupted, so a stuck or crashed worker is replaced on the next task.
  private fail(reason: Error) {
    this.worker?.terminate()
    this.worker = null
    const running = this.running
    if (!running) return
    this.finish(running)
    running.task.reject(reason)
  }

  private finish(running: Running) {
    clearTimeout(running.timer)
    this.running = null
    this.next()
  }
}

/** Runs the player's tasks and the pool refill on separate workers, each task under a timeout. */
export class WorkerPool {
  private readonly lanes: Record<Lane, WorkerLane> = {
    foreground: new WorkerLane(),
    background: new WorkerLane(),
  }
  private idCounter = 0

  constructor() {
    this.lanes.foreground.warm()
  }

  /** Queues a task on a lane and resolves with the worker's result. */
  public runTask<K extends TaskType>(
    type: K,
    payload: Requests[K],
    lane: Lane = Lane.FOREGROUND,
  ): Promise<Responses[K]> {
    return new Promise((resolve, reject) => {
      // WorkerRequest is a union, so TypeScript loses the tie between K and Responses[K] here.
      const request = { id: ++this.idCounter, type, ...payload } as WorkerRequest
      this.lanes[lane].run({ request, resolve: resolve as Task['resolve'], reject })
    })
  }

  public terminate() {
    this.lanes.foreground.dispose()
    this.lanes.background.dispose()
  }
}
