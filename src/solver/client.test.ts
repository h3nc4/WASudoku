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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BOARD_LENGTH, encodeGenerate, encodeHint, encodeValidate } from '../core/codec/wire'
import {
  createSolverClient,
  type SolverClient,
  SolverError,
  spawnWorker,
  TASK_TIMEOUT_MS,
} from './client'
import { PROTOCOL_VERSION, type Request } from './protocol'

const v = PROTOCOL_VERSION

/** A worker that records what it is sent and lets a test answer or break it. */
class FakeWorker extends EventTarget {
  readonly posted: { request: Request; transfer: Transferable[] }[] = []
  readonly terminate = vi.fn()

  postMessage(request: Request, transfer: Transferable[]) {
    this.posted.push({ request, transfer })
  }

  get last(): Request {
    const last = this.posted.at(-1)
    if (last === undefined) throw new Error('nothing was posted')
    return last.request
  }

  reply(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }

  /** Answers the last request with `bytes`, transferred as the worker does. */
  answer(bytes: Uint8Array, id = this.last.id) {
    this.reply({ v, id, bytes: bytes.slice().buffer })
  }

  fire(type: 'error' | 'messageerror') {
    const event = new Event(type, { cancelable: true })
    this.dispatchEvent(event)
    return event
  }
}

const cells = new Uint8Array(BOARD_LENGTH)
const SEVERAL = encodeValidate({ kind: 'several' })
const UNSOLVABLE = encodeValidate({ kind: 'unsolvable' })
const STUCK = encodeHint({ kind: 'stuck', solution: new Uint8Array(BOARD_LENGTH).fill(5) })
const solve = { kind: 'solve', cells } as const
const validate = { kind: 'validate', cells } as const
const generate = { kind: 'generate', difficulty: 'expert', seed: 7 } as const

/** Settles with what the promise did, so a test can check it without an unhandled rejection. */
const outcome = (promise: Promise<unknown>) =>
  promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  )

const failure = (reason: string) => ({ error: expect.objectContaining({ reason }) as unknown })

describe('createSolverClient', () => {
  let workers: FakeWorker[]
  let client: SolverClient

  beforeEach(() => {
    vi.useFakeTimers()
    workers = []
    client = createSolverClient(() => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker as unknown as Worker
    })
  })

  afterEach(() => {
    client.dispose()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** Runs a task the test never settles, so the dispose after it rejects nothing unhandled. */
  const start = (...args: Parameters<SolverClient['run']>) => {
    client.run(...args).catch(() => undefined)
  }

  const worker = (index: number) => {
    const found = workers.at(index)
    if (found === undefined) throw new Error(`no worker ${String(index)}`)
    return found
  }

  describe('starting workers', () => {
    it('starts no worker until a task or warm() needs one', () => {
      expect(workers).toHaveLength(0)
      client.warm()
      client.warm()
      expect(workers).toHaveLength(1)
      start(validate)
      expect(worker(0).posted).toHaveLength(1)
      expect(workers).toHaveLength(1)
    })

    it('starts the background worker on its first task, apart from the foreground one', () => {
      client.warm()
      start(validate, { lane: 'background' })
      expect(workers).toHaveLength(2)
      expect(worker(0).posted).toHaveLength(0)
      expect(worker(1).posted).toHaveLength(1)
    })

    it('spawns a module worker from worker.ts by default', () => {
      const created: { url: unknown; options: unknown }[] = []
      vi.stubGlobal(
        'Worker',
        class {
          readonly url: unknown
          readonly options: unknown

          constructor(url: unknown, options: unknown) {
            this.url = url
            this.options = options
            created.push(this)
          }
        },
      )
      spawnWorker()
      createSolverClient()
      expect(created).toHaveLength(1)
      expect(String(created[0]?.url)).toMatch(/\/worker\.ts(\?|$)/)
      expect(created[0]?.options).toEqual({ type: 'module' })
      vi.unstubAllGlobals()
    })
  })

  describe('running tasks', () => {
    it('sends a board kind with a copy of its cells, transferred', () => {
      const board = new Uint8Array(BOARD_LENGTH).fill(3)
      start({ kind: 'hint', cells: board })
      const [{ request, transfer }] = worker(0).posted as [FakeWorker['posted'][number]]
      expect(request).toEqual({ v, id: request.id, kind: 'hint', cells: board })
      expect('cells' in request && request.cells).not.toBe(board)
      expect(transfer).toEqual(['cells' in request && request.cells.buffer])
    })

    it('sends a generate task with its difficulty and seed, transferring nothing', () => {
      start(generate)
      expect(worker(0).posted).toEqual([
        { request: { v, id: worker(0).last.id, ...generate }, transfer: [] },
      ])
    })

    it('resolves with the decoded result of each kind', async () => {
      const hint = client.run({ kind: 'hint', cells })
      worker(0).answer(STUCK)
      await expect(hint).resolves.toEqual({
        ok: true,
        result: { kind: 'stuck', solution: new Uint8Array(BOARD_LENGTH).fill(5) },
      })
      const generated = client.run(generate)
      const puzzle = new Uint8Array(BOARD_LENGTH)
      const solution = new Uint8Array(BOARD_LENGTH).fill(9)
      worker(0).answer(
        encodeGenerate({ kind: 'generated', difficulty: 'expert', puzzle, solution }),
      )
      await expect(generated).resolves.toEqual({
        ok: true,
        result: { kind: 'generated', difficulty: 'expert', puzzle, solution },
      })
    })

    it('resolves with the decoder fault for bytes the wire codec cannot read', async () => {
      const solved = client.run(solve)
      worker(0).answer(SEVERAL)
      await expect(solved).resolves.toEqual({ ok: false, error: 'tag' })
    })

    it('runs one task at a time per lane, in order', async () => {
      const first = client.run(validate)
      const second = client.run(validate)
      const background = client.run(validate, { lane: 'background' })
      expect(worker(0).posted).toHaveLength(1)
      expect(worker(1).posted).toHaveLength(1)
      worker(0).answer(SEVERAL)
      await expect(first).resolves.toEqual({ ok: true, result: { kind: 'several' } })
      expect(worker(0).posted).toHaveLength(2)
      worker(0).answer(UNSOLVABLE)
      await expect(second).resolves.toEqual({ ok: true, result: { kind: 'unsolvable' } })
      worker(1).answer(SEVERAL)
      await expect(background).resolves.toEqual({ ok: true, result: { kind: 'several' } })
    })

    it('gives every request its own id', () => {
      start(validate)
      start(validate, { lane: 'background' })
      expect(worker(0).last.id).not.toBe(worker(1).last.id)
    })
  })

  describe('validating', () => {
    it.each([
      ['a short board', { kind: 'solve', cells: new Uint8Array(3) }],
      ['a negative seed', { kind: 'generate', difficulty: 'easy', seed: -1 }],
      ['an unknown difficulty', { kind: 'generate', difficulty: 'hardest', seed: 1 }],
    ] as const)('rejects %s without starting a worker', async (_, task) => {
      await expect(outcome(client.run(task as never))).resolves.toEqual(failure('invalid'))
      expect(workers).toHaveLength(0)
    })

    it('drops and logs a malformed response, then times out', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const pending = outcome(client.run(validate))
      worker(0).reply({ v, id: worker(0).last.id, bytes: [1, 1, 3] })
      worker(0).reply('garbage')
      expect(error).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(TASK_TIMEOUT_MS)
      await expect(pending).resolves.toEqual(failure('timeout'))
    })

    it('ignores a stale response whose id is not the running one', async () => {
      const pending = client.run(validate)
      const { id } = worker(0).last
      worker(0).answer(UNSOLVABLE, id - 1)
      worker(0).answer(UNSOLVABLE, id + 1)
      worker(0).answer(SEVERAL, id)
      await expect(pending).resolves.toEqual({ ok: true, result: { kind: 'several' } })
    })

    it('ignores a response when nothing is running', () => {
      client.warm()
      expect(() => {
        worker(0).answer(SEVERAL, 1)
      }).not.toThrow()
    })
  })

  describe('cancelling', () => {
    it('rejects at once for a signal already aborted', async () => {
      const controller = new AbortController()
      controller.abort('gone')
      const result = await outcome(client.run(validate, { signal: controller.signal }))
      expect(result).toEqual(failure('aborted'))
      expect(result).toHaveProperty('error.cause', 'gone')
      expect(workers).toHaveLength(0)
    })

    it('terminates the worker of a running task and starts a fresh one for the next', async () => {
      const controller = new AbortController()
      const running = outcome(client.run(generate, { signal: controller.signal }))
      const next = client.run(validate)
      controller.abort()
      await expect(running).resolves.toEqual(failure('aborted'))
      expect(worker(0).terminate).toHaveBeenCalledOnce()
      expect(worker(1).last.kind).toBe('validate')
      worker(1).answer(SEVERAL)
      await expect(next).resolves.toEqual({ ok: true, result: { kind: 'several' } })
    })

    it('drops a queued task without disturbing the running one', async () => {
      const controller = new AbortController()
      const running = client.run(validate)
      const queued = outcome(client.run(solve, { signal: controller.signal }))
      const after = client.run(validate)
      controller.abort()
      await expect(queued).resolves.toEqual(failure('aborted'))
      expect(worker(0).terminate).not.toHaveBeenCalled()
      worker(0).answer(SEVERAL)
      await running
      expect(worker(0).last.kind).toBe('validate')
      worker(0).answer(UNSOLVABLE)
      await expect(after).resolves.toEqual({ ok: true, result: { kind: 'unsolvable' } })
    })

    it('stops listening once the task settled', async () => {
      const controller = new AbortController()
      const done = client.run(validate, { signal: controller.signal })
      worker(0).answer(SEVERAL)
      await done
      const next = client.run(validate)
      controller.abort()
      expect(worker(0).terminate).not.toHaveBeenCalled()
      worker(0).answer(SEVERAL)
      await expect(next).resolves.toEqual({ ok: true, result: { kind: 'several' } })
    })
  })

  describe('failing', () => {
    it('times out after the default and replaces the worker', async () => {
      const pending = outcome(client.run(generate))
      await vi.advanceTimersByTimeAsync(TASK_TIMEOUT_MS - 1)
      expect(worker(0).terminate).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      await expect(pending).resolves.toEqual(failure('timeout'))
      expect(worker(0).terminate).toHaveBeenCalledOnce()
    })

    it('takes a timeout per task and times from its start, not from its queueing', async () => {
      const first = client.run(validate)
      const second = outcome(client.run(validate, { timeoutMs: 100 }))
      await vi.advanceTimersByTimeAsync(500)
      worker(0).answer(SEVERAL)
      await first
      await vi.advanceTimersByTimeAsync(99)
      worker(0).fire('messageerror')
      await expect(second).resolves.toEqual(failure('crashed'))
    })

    it.each(['error', 'messageerror'] as const)(
      'rejects as crashed on %s and handles the event',
      async (type) => {
        const pending = outcome(client.run(validate))
        const event = worker(0).fire(type)
        await expect(pending).resolves.toEqual(failure('crashed'))
        expect(event.defaultPrevented).toBe(true)
        expect(worker(0).terminate).toHaveBeenCalledOnce()
      },
    )

    it('respawns only when a task waits, so a worker that cannot load does not loop', async () => {
      client.warm()
      worker(0).fire('error')
      worker(0).fire('error')
      expect(workers).toHaveLength(1)
      const pending = outcome(client.run(validate))
      expect(workers).toHaveLength(2)
      worker(1).reply({ v, id: worker(1).last.id, fault: 'load' })
      await expect(pending).resolves.toEqual(failure('load'))
      expect(worker(1).terminate).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(TASK_TIMEOUT_MS)
      expect(workers).toHaveLength(2)
    })

    it('rejects as crashed when an export trapped', async () => {
      const pending = outcome(client.run(solve))
      worker(0).reply({ v, id: worker(0).last.id, fault: 'trap' })
      await expect(pending).resolves.toEqual(failure('crashed'))
      expect(worker(0).terminate).toHaveBeenCalledOnce()
    })

    it('ignores what a replaced worker still sends', async () => {
      const pending = outcome(client.run(validate))
      const old = worker(0)
      old.fire('error')
      await pending
      const next = client.run(validate)
      old.answer(UNSOLVABLE, worker(1).last.id)
      old.fire('error')
      worker(1).answer(SEVERAL)
      await expect(next).resolves.toEqual({ ok: true, result: { kind: 'several' } })
    })

    it('rejects every task with disposed when shut down', async () => {
      const running = outcome(client.run(validate))
      const queued = outcome(client.run(validate))
      const background = outcome(client.run(validate, { lane: 'background' }))
      client.dispose()
      for (const pending of [running, queued, background]) {
        await expect(pending).resolves.toEqual(failure('disposed'))
      }
      expect(worker(0).terminate).toHaveBeenCalledOnce()
      expect(worker(1).terminate).toHaveBeenCalledOnce()
    })
  })

  it('names its errors', () => {
    const error = new SolverError('timeout')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('SolverError')
    expect(error.message).toMatch(/too long/)
  })
})
