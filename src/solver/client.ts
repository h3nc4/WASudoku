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
  /** True while a foreground job may stop this running one, which then calls `yielded` and not `reject`. */
  readonly preemptible?: () => boolean
  readonly yielded?: () => void
}

interface LaneOptions {
  /** Lets a pushed job stop a running one that says it is preemptible. */
  readonly preempts?: boolean
  /** Called each time the lane runs out of jobs. */
  readonly onIdle?: () => void
}

/** One worker running one job at a time from its own queue, started only when a job needs it. */
class WorkerLane {
  private worker: Worker | null = null
  private running: { readonly job: Job; readonly timer: ReturnType<typeof setTimeout> } | null =
    null
  private queue: Job[] = []
  private readonly spawn: Spawn
  private readonly options: LaneOptions

  constructor(spawn: Spawn, options: LaneOptions = {}) {
    this.spawn = spawn
    this.options = options
  }

  get idle(): boolean {
    return this.running === null && this.queue.length === 0
  }

  warm(): void {
    this.worker ??= this.start()
  }

  push(job: Job, front = false): void {
    if (front) this.queue.unshift(job)
    else this.queue.push(job)
    const stopped = this.running?.job
    if (this.options.preempts === true && stopped?.preemptible?.() === true) {
      this.stop()
      stopped.yielded?.()
      return
    }
    this.next()
  }

  runs(job: Job): boolean {
    return this.running?.job === job
  }

  /** Drops a queued job without settling it. */
  remove(job: Job): void {
    this.queue = this.queue.filter((queued) => queued !== job)
  }

  cancel(job: Job, reason: SolverError): void {
    if (this.runs(job)) {
      this.fail(reason)
      return
    }
    this.remove(job)
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
      if (job === undefined) {
        this.options.onIdle?.()
        return
      }
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

  // The job settles before the next one starts. The idle hook then sees what its result changed.
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
    this.release()
    job.resolve(response.bytes)
    this.next()
  }

  // Wasm cannot be interrupted, so a stuck or failed worker is replaced, but only for a waiting job.
  private fail(reason: SolverError): void {
    this.running?.job.reject(reason)
    this.stop()
  }

  private stop(): void {
    this.worker?.terminate()
    this.worker = null
    this.release()
    this.next()
  }

  private release(): void {
    if (this.running !== null) clearTimeout(this.running.timer)
    this.running = null
  }
}

type GenerateRequest = Extract<Request, { kind: 'generate' }>

interface Settle {
  readonly resolve: (bytes: ArrayBuffer) => void
  readonly reject: (reason: SolverError) => void
}

/** A caller waiting on a generate, and the unit whose failure rejects it. */
interface Waiter extends Settle {
  readonly lane: Lane
  readonly difficulty: Difficulty
  unit: Unit
  joined: boolean
}

/** One generate on a worker. Its result goes to whichever waiter needs that difficulty most. */
interface Unit {
  readonly lane: Lane
  readonly request: GenerateRequest
  readonly job: Job
  owner: Waiter | null
}

const SEED_LIMIT = Number.MAX_SAFE_INTEGER + 1

// Generation is rejection sampling, so a puzzle from any seed is as good as another.
// That lets any caller of a difficulty take any result, and a late copy has an early one's odds.
class Generator {
  private waiters: Waiter[] = []
  private readonly spares = new Map<Difficulty, ArrayBuffer[]>()
  private readonly lanes: Readonly<Record<Lane, WorkerLane>>
  private readonly nextId: () => number

  constructor(lanes: Readonly<Record<Lane, WorkerLane>>, nextId: () => number) {
    this.lanes = lanes
    this.nextId = nextId
  }

  /** Takes a result left over from a race of this difficulty, if there is one. */
  spare(difficulty: Difficulty): ArrayBuffer | undefined {
    return this.spares.get(difficulty)?.shift()
  }

  /** Queues a unit on `lane` and returns how to cancel the wait. */
  run(
    lane: Lane,
    request: GenerateRequest,
    timeoutMs: number,
    settle: Settle,
  ): (reason: SolverError) => void {
    const unit = this.unit(lane, request, timeoutMs)
    const waiter: Waiter = { ...settle, lane, difficulty: request.difficulty, unit, joined: false }
    unit.owner = waiter
    this.waiters.push(waiter)
    this.lanes[lane].push(unit.job)
    this.join()
    return (reason) => {
      this.lanes[waiter.unit.lane].cancel(waiter.unit.job, reason)
    }
  }

  /** Runs a copy of a waiting foreground generate on the background worker, once it has nothing else. */
  join(): void {
    if (!this.lanes.background.idle) return
    const waiter = this.waiters.find((w) => w.lane === 'foreground' && !w.joined)
    if (waiter === undefined) return
    waiter.joined = true
    const seed = (waiter.unit.request.seed + 1) % SEED_LIMIT
    const request = this.request(waiter.difficulty, seed)
    const copy = this.unit('background', request, waiter.unit.job.timeoutMs)
    this.lanes.background.push(copy.job)
  }

  private request(difficulty: Difficulty, seed: number): GenerateRequest {
    return { v: PROTOCOL_VERSION, id: this.nextId(), kind: 'generate', difficulty, seed }
  }

  private unit(lane: Lane, request: GenerateRequest, timeoutMs: number): Unit {
    const unit: Unit = {
      lane,
      request,
      owner: null,
      job: {
        request,
        transfer: [],
        timeoutMs,
        resolve: (bytes) => {
          this.deliver(unit, bytes)
        },
        reject: (reason) => {
          this.close(unit.owner)?.reject(reason)
        },
        preemptible: () => unit.owner?.lane !== 'foreground',
        yielded: () => {
          if (unit.owner !== null) this.adopt(unit.owner, unit)
        },
      },
    }
    return unit
  }

  /** Gives `owner` a fresh unit like `like`, at the front of its own lane. */
  private adopt(owner: Waiter, like: Unit): void {
    const unit = this.unit(owner.lane, { ...like.request, id: this.nextId() }, like.job.timeoutMs)
    unit.owner = owner
    owner.unit = unit
    this.lanes[owner.lane].push(unit.job, true)
  }

  private close(waiter: Waiter | null): Waiter | null {
    this.waiters = this.waiters.filter((w) => w !== waiter)
    return waiter
  }

  // A foreground waiter comes first. The one whose unit it took inherits its unit in exchange.
  private deliver(unit: Unit, bytes: ArrayBuffer): void {
    const { difficulty } = unit.request
    const open = this.waiters.filter((w) => w.difficulty === difficulty)
    const target = open.find((w) => w.lane === 'foreground') ?? unit.owner ?? open[0]
    if (target === undefined) {
      this.spares.set(difficulty, [...(this.spares.get(difficulty) ?? []), bytes])
      return
    }
    this.close(target)
    if (target !== unit.owner) this.hand(target.unit, unit.owner)
    target.resolve(bytes)
  }

  // A running unit keeps going. Queued, it is dropped and its new owner gets a copy on its own lane.
  private hand(unit: Unit, owner: Waiter | null): void {
    unit.owner = owner
    if (owner !== null) owner.unit = unit
    const lane = this.lanes[unit.lane]
    if (lane.runs(unit.job)) return
    lane.remove(unit.job)
    if (owner !== null) this.adopt(owner, unit)
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

// A foreground lane for the player's requests and a background lane for refills.
// A foreground generate takes the first result of its difficulty from either lane.
export function createSolverClient(spawn: Spawn = spawnWorker): SolverClient {
  let lastId = 0
  const nextId = (): number => {
    lastId += 1
    return lastId
  }
  const lanes: Readonly<Record<Lane, WorkerLane>> = {
    foreground: new WorkerLane(spawn, { preempts: true }),
    background: new WorkerLane(spawn, {
      onIdle: () => {
        generator.join()
      },
    }),
  }
  const generator = new Generator(lanes, nextId)

  // The overload ties each task to its result, which a generic body cannot narrow to.
  function run<T extends Task>(task: T, options?: RunOptions): Promise<ResultOf<T>>
  function run(task: Task, options: RunOptions = {}): Promise<Decoded<Results[Kind]>> {
    const { lane = 'foreground', signal, timeoutMs = TASK_TIMEOUT_MS } = options
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new SolverError('aborted', signal.reason))
        return
      }
      const { request, transfer } = message(nextId(), task)
      const parsed = parseRequest(request)
      if (parsed === null) {
        reject(new SolverError('invalid'))
        return
      }
      const spare = parsed.kind === 'generate' ? generator.spare(parsed.difficulty) : undefined
      if (spare !== undefined) {
        resolve(decode(task.kind, new Uint8Array(spare)))
        return
      }
      let cancel: (reason: SolverError) => void
      const detach = onAbort(signal, (reason) => {
        cancel(reason)
      })
      const settle: Settle = {
        resolve: (bytes) => {
          detach()
          resolve(decode(task.kind, new Uint8Array(bytes)))
        },
        reject: (reason) => {
          detach()
          reject(reason)
        },
      }
      if (parsed.kind === 'generate') {
        cancel = generator.run(lane, parsed, timeoutMs, settle)
        return
      }
      const job: Job = { request: parsed, transfer, timeoutMs, ...settle }
      cancel = (reason) => {
        lanes[lane].cancel(job, reason)
      }
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
