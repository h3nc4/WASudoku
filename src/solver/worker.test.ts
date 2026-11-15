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

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WireModule } from '../core/codec/abi'
import { BOARD_LENGTH } from '../core/codec/wire'
import { PROTOCOL_VERSION, type Response } from './protocol'
import { type Scope, serve } from './worker'

const loads = vi.hoisted(() => ({ count: 0 }))

vi.mock('./load', () => ({
  loadWire: () => {
    loads.count += 1
    return new Promise<never>(() => undefined)
  },
}))

const v = PROTOCOL_VERSION
const cells = new Uint8Array(BOARD_LENGTH).fill(1)

/** A wire module answering each export with its own marker byte. */
function fakeWire(): WireModule {
  return {
    solve: vi.fn(() => Uint8Array.of(1)),
    validate: vi.fn(() => Uint8Array.of(2)),
    nextStep: vi.fn(() => Uint8Array.of(3)),
    generate: vi.fn(() => Uint8Array.of(4)),
  }
}

/** A worker scope that records what it posts and lets a test send it messages. */
function fakeScope() {
  let listener: (event: MessageEvent<unknown>) => void = () => undefined
  const posted: { message: Response; options: StructuredSerializeOptions }[] = []
  const scope: Scope = {
    addEventListener: (_, handler) => {
      listener = handler
    },
    postMessage: (message, options) => {
      posted.push({ message, options })
    },
  }
  const send = async (data: unknown) => {
    listener(new MessageEvent('message', { data }))
    await vi.waitFor(() => {
      expect(posted.length).toBeGreaterThan(0)
    })
    return posted.shift()!
  }
  return { scope, posted, send, listener: () => listener }
}

describe('serve', () => {
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('starts loading the module as soon as the worker starts', () => {
    expect(loads.count).toBe(1)
  })

  it.each([
    ['solve', 1],
    ['validate', 2],
    ['hint', 3],
  ])('answers %s with the wire bytes, transferred', async (kind, marker) => {
    const { scope, send } = fakeScope()
    serve(scope, Promise.resolve(fakeWire()))
    const { message, options } = await send({ v, id: 5, kind, cells })
    expect(message).toEqual({ v, id: 5, bytes: Uint8Array.of(marker).buffer })
    expect('bytes' in message && options.transfer).toEqual(['bytes' in message && message.bytes])
  })

  it('passes the difficulty and seed of a generate request', async () => {
    const { scope, send } = fakeScope()
    const wire = fakeWire()
    serve(scope, Promise.resolve(wire))
    const { message } = await send({ v, id: 6, kind: 'generate', difficulty: 'hard', seed: 42 })
    expect(message).toEqual({ v, id: 6, bytes: Uint8Array.of(4).buffer })
    expect(wire.generate).toHaveBeenCalledWith('hard', 42)
  })

  it('answers every request with a load fault when the module fails to load', async () => {
    const { scope, send } = fakeScope()
    serve(scope, Promise.reject(new Error('404')))
    expect((await send({ v, id: 1, kind: 'solve', cells })).message).toEqual({
      v,
      id: 1,
      fault: 'load',
    })
    expect((await send({ v, id: 2, kind: 'hint', cells })).message).toEqual({
      v,
      id: 2,
      fault: 'load',
    })
    expect(error).toHaveBeenCalledOnce()
  })

  it('answers with a trap fault when an export throws', async () => {
    const { scope, send } = fakeScope()
    const wire = {
      ...fakeWire(),
      solve: () => {
        throw new WebAssembly.RuntimeError('unreachable')
      },
    }
    serve(scope, Promise.resolve(wire))
    expect((await send({ v, id: 3, kind: 'solve', cells })).message).toEqual({
      v,
      id: 3,
      fault: 'trap',
    })
    expect(error).toHaveBeenCalledOnce()
  })

  it('drops and logs a malformed request without answering', async () => {
    const { scope, posted, listener } = fakeScope()
    serve(scope, Promise.resolve(fakeWire()))
    listener()(new MessageEvent('message', { data: { v, id: 1, kind: 'solve', cells: [] } }))
    await Promise.resolve()
    await Promise.resolve()
    expect(posted).toEqual([])
    expect(error).toHaveBeenCalledOnce()
  })

  it('answers requests in the order they came while the module loads', async () => {
    const { scope, posted, listener } = fakeScope()
    let finish: (wire: WireModule) => void = () => undefined
    serve(
      scope,
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    for (const id of [1, 2, 3]) {
      listener()(new MessageEvent('message', { data: { v, id, kind: 'validate', cells } }))
    }
    expect(posted).toEqual([])
    finish(fakeWire())
    await vi.waitFor(() => {
      expect(posted.map(({ message }) => message.id)).toEqual([1, 2, 3])
    })
  })
})
