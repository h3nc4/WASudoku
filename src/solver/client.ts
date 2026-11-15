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

import { decodeGenerate, decodeHint, decodeSolve, decodeValidate } from '../core/codec/wire'
import type {
  Cells,
  Decoded,
  Difficulty,
  GenerateResult,
  HintResult,
  SolveResult,
  ValidateResult,
} from '../core/codec/wire.types'
import {
  type BoardKind,
  type Kind,
  parseRequest,
  parseResponse,
  PROTOCOL_VERSION,
  type Request,
} from './protocol'

/** Longest a task may run before its worker is replaced. Expert peaks near 2 s on a desktop. */
export const TASK_TIMEOUT_MS = 30_000

/** The worker a task runs on, so a player's request never queues behind a background refill. */
export type Lane = 'foreground' | 'background'

export type Task =
  | { readonly kind: BoardKind; readonly cells: Cells }
  | { readonly kind: 'generate'; readonly difficulty: Difficulty; readonly seed: number }

interface Results {
  readonly solve: SolveResult
  readonly validate: ValidateResult
  readonly hint: HintResult
  readonly generate: GenerateResult
}

/** What a task resolves with, its wire bytes decoded. */
export type ResultOf<T extends Task> = Decoded<Results[T['kind']]>

const DECODERS: { readonly [K in Kind]: (bytes: Uint8Array) => Decoded<Results[K]> } = {
  solve: decodeSolve,
  validate: decodeValidate,
  hint: decodeHint,
  generate: decodeGenerate,
}

function decode<K extends Kind>(kind: K, bytes: Uint8Array): Decoded<Results[K]> {
  return DECODERS[kind](bytes)
}

/** Why a task rejected. */
export type Failure = 'aborted' | 'timeout' | 'crashed' | 'load' | 'invalid' | 'disposed'

const MESSAGES: Readonly<Record<Failure, string>> = {
  aborted: 'The solver task was cancelled.',
  timeout: 'The solver took too long and was restarted.',
  crashed: 'The solver stopped unexpectedly and was restarted.',
  load: 'The solver failed to load.',
  invalid: 'The solver was given a task it cannot read.',
  disposed: 'The solver was shut down.',
}

export class SolverError extends Error {
  readonly reason: Failure

  /** `cause` is the signal's reason for an aborted task, or what a failed worker spawn threw. */
  constructor(reason: Failure, cause?: unknown) {
    super(MESSAGES[reason], { cause })
    this.name = 'SolverError'
    this.reason = reason
  }
}

export interface RunOptions {
  readonly lane?: Lane
  /** Aborting it rejects with an `aborted` error and, if the task is running, replaces the worker. */
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

export interface SolverClient {
  /** Queues `task` on its lane, foreground by default, and resolves with its decoded result. */
  run<T extends Task>(task: T, options?: RunOptions): Promise<ResultOf<T>>
  /** Starts the foreground worker ahead of its first task, so that task skips the wasm compile. */
  warm(): void
  /** Stops both workers and rejects every task with a `disposed` error. */
  dispose(): void
}

export type Spawn = () => Worker

export const spawnWorker: Spawn = () =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

interface Job {
  readonly request: Request
  readonly transfer: Transferable[]
  readonly timeoutMs: number
  readonly resolve: (bytes: ArrayBuffer) => void
  readonly reject: (reason: SolverError) => void
}

/** One worker running one job at a time from its own queue, started only when a job needs it. */
class WorkerLane {
  private worker: Worker | null = null
  private running: { readonly job: Job; readonly timer: ReturnType<typeof setTimeout> } | null =
    null
  private queue: Job[] = []
  private readonly spawn: Spawn

  constructor(spawn: Spawn) {
    this.spawn = spawn
  }

  warm(): void {
    this.worker ??= this.start()
  }

  push(job: Job): void {
    this.queue.push(job)
    this.next()
  }

  cancel(job: Job, reason: SolverError): void {
    if (this.running?.job === job) {
      this.fail(reason)
      return
    }
    this.queue = this.queue.filter((queued) => queued !== job)
    job.reject(reason)
  }

  dispose(): void {
    const jobs = this.running === null ? this.queue : [this.running.job, ...this.queue]
    this.queue = []
    this.stop()
    for (const job of jobs) job.reject(new SolverError('disposed'))
  }

  private start(): Worker {
    const worker = this.spawn()
    const current = () => this.worker === worker
    worker.addEventListener('message', (event) => {
      if (current()) this.receive(event.data)
    })
    const crash = (event: Event) => {
      event.preventDefault()
      if (current()) this.fail(new SolverError('crashed'))
    }
    worker.addEventListener('error', crash)
    worker.addEventListener('messageerror', crash)
    return worker
  }

  // A worker that cannot be spawned rejects each waiting job as a load failure, so none hangs.
  private next(): void {
    while (this.running === null) {
      const job = this.queue.shift()
      if (job === undefined) return
      let worker: Worker
      try {
        worker = this.worker ?? this.start()
      } catch (error) {
        job.reject(new SolverError('load', error))
        continue
      }
      this.worker = worker
      const timer = setTimeout(() => {
        this.fail(new SolverError('timeout'))
      }, job.timeoutMs)
      this.running = { job, timer }
      worker.postMessage(job.request, job.transfer)
    }
  }

  private receive(data: unknown): void {
    const response = parseResponse(data)
    if (response === null) {
      console.error('The solver client dropped a malformed response', data)
      return
    }
    const job = this.running?.job
    if (job?.request.id !== response.id) return
    if ('fault' in response) {
      this.fail(new SolverError(response.fault === 'load' ? 'load' : 'crashed'))
      return
    }
    this.finish()
    job.resolve(response.bytes)
  }

  // Wasm cannot be interrupted, so a stuck or failed worker is replaced, but only for a waiting job.
  private fail(reason: SolverError): void {
    this.running?.job.reject(reason)
    this.stop()
  }

  private stop(): void {
    this.worker?.terminate()
    this.worker = null
    this.finish()
  }

  private finish(): void {
    if (this.running !== null) clearTimeout(this.running.timer)
    this.running = null
    this.next()
  }
}

/** The request and transferred buffers for `task`, with the board copied so the caller keeps its own. */
function message(id: number, task: Task): { request: unknown; transfer: Transferable[] } {
  if (task.kind === 'generate') {
    const { kind, difficulty, seed } = task
    return { request: { v: PROTOCOL_VERSION, id, kind, difficulty, seed }, transfer: [] }
  }
  const cells = new Uint8Array(task.cells)
  return { request: { v: PROTOCOL_VERSION, id, kind: task.kind, cells }, transfer: [cells.buffer] }
}

/** Calls `cancel` if `signal` aborts, until the returned function detaches it. */
function onAbort(
  signal: AbortSignal | undefined,
  cancel: (reason: SolverError) => void,
): () => void {
  if (signal === undefined) return () => undefined
  const listener = () => {
    cancel(new SolverError('aborted', signal.reason))
  }
  signal.addEventListener('abort', listener, { once: true })
  return () => {
    signal.removeEventListener('abort', listener)
  }
}

/** A client with a foreground lane for the player's requests and a background lane for refills. */
export function createSolverClient(spawn: Spawn = spawnWorker): SolverClient {
  const lanes: Readonly<Record<Lane, WorkerLane>> = {
    foreground: new WorkerLane(spawn),
    background: new WorkerLane(spawn),
  }
  let lastId = 0

  // The overload ties each task to its result, which a generic body cannot narrow to.
  function run<T extends Task>(task: T, options?: RunOptions): Promise<ResultOf<T>>
  function run(task: Task, options: RunOptions = {}): Promise<Decoded<Results[Kind]>> {
    const { lane = 'foreground', signal, timeoutMs = TASK_TIMEOUT_MS } = options
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new SolverError('aborted', signal.reason))
        return
      }
      lastId += 1
      const { request, transfer } = message(lastId, task)
      const parsed = parseRequest(request)
      if (parsed === null) {
        reject(new SolverError('invalid'))
        return
      }
      const job: Job = {
        request: parsed,
        transfer,
        timeoutMs,
        resolve: (bytes) => {
          detach()
          resolve(decode(task.kind, new Uint8Array(bytes)))
        },
        reject: (reason) => {
          detach()
          reject(reason)
        },
      }
      const detach = onAbort(signal, (reason) => {
        lanes[lane].cancel(job, reason)
      })
      lanes[lane].push(job)
    })
  }

  return {
    run,
    warm: () => {
      lanes.foreground.warm()
    },
    dispose: () => {
      lanes.foreground.dispose()
      lanes.background.dispose()
    },
  }
}
