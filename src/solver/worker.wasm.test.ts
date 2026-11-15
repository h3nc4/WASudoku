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

// @vitest-environment node
/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  BOARD_LENGTH,
  decodeGenerate,
  decodeHint,
  decodeSolve,
  decodeValidate,
} from '../core/codec/wire'
import type { Decoded } from '../core/codec/wire.types'
import { PROTOCOL_VERSION, type Response } from './protocol'

// Runs the built crate, so this suite needs `npm run wasm:build:dev` first, as `npm run test` does.
const WASM_PATH = resolve('src/wasudoku-wasm/pkg/wasudoku_wasm.wasm')

const PUZZLE = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79'
const SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
const NORVIG = '.....5.8....6.1.43..........1.5........1.6...3.......553.....61........4.........'
const SEED = 1

const v = PROTOCOL_VERSION
const cellsOf = (text: string) => Uint8Array.from(text, (c) => (c === '.' ? 0 : Number(c)))
const textOf = (cells: Uint8Array) => Array.from(cells, (d) => (d === 0 ? '.' : String(d))).join('')

function ok<T>(decoded: Decoded<T>): T {
  if (!decoded.ok) throw new Error(`decode failed: ${decoded.error}`)
  return decoded.result
}

describe('worker.ts against the real wasm', () => {
  let listener: (event: MessageEvent<unknown>) => void
  const posted: { message: Response; options: StructuredSerializeOptions }[] = []
  let nextId = 0

  beforeAll(async () => {
    // Node cannot fetch the dev server's URL, so the worker's own fetch reads the built file.
    const module = readFileSync(WASM_PATH)
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response(module, { headers: { 'Content-Type': 'application/wasm' } })),
    )
    vi.stubGlobal('self', {
      addEventListener: (_: string, handler: typeof listener) => {
        listener = handler
      },
      postMessage: (message: Response, options: StructuredSerializeOptions) => {
        posted.push({ message, options })
      },
    })
    await import('./worker')
  })

  /** Sends a request and returns the answer's bytes, checking they were transferred. */
  async function send(request: Record<string, unknown>): Promise<Uint8Array> {
    nextId += 1
    posted.length = 0
    listener(new MessageEvent('message', { data: { v, id: nextId, ...request } }))
    await vi.waitFor(() => {
      expect(posted).toHaveLength(1)
    })
    const [{ message, options }] = posted as [(typeof posted)[number]]
    expect(message.id).toBe(nextId)
    if (!('bytes' in message)) throw new Error(`fault: ${message.fault}`)
    expect(options.transfer).toEqual([message.bytes])
    return new Uint8Array(message.bytes)
  }

  it('solves with steps', async () => {
    const result = ok(decodeSolve(await send({ kind: 'solve', cells: cellsOf(PUZZLE) })))
    if (result.kind !== 'solved') throw new Error(result.kind)
    expect(textOf(result.solution)).toBe(SOLUTION)
    expect(result.steps.length).toBeGreaterThan(0)
  })

  it('validates', async () => {
    const unique = ok(decodeValidate(await send({ kind: 'validate', cells: cellsOf(PUZZLE) })))
    expect(unique.kind === 'unique' && textOf(unique.solution)).toBe(SOLUTION)
    const none = ok(decodeValidate(await send({ kind: 'validate', cells: cellsOf(NORVIG) })))
    expect(none).toEqual({ kind: 'unsolvable' })
  })

  it('hints the first step of a solve', async () => {
    const solved = ok(decodeSolve(await send({ kind: 'solve', cells: cellsOf(PUZZLE) })))
    const hint = ok(decodeHint(await send({ kind: 'hint', cells: cellsOf(PUZZLE) })))
    expect(hint).toEqual({ kind: 'step', step: solved.kind === 'solved' && solved.steps[0] })
  })

  it('generates the same puzzle for the same seed', async () => {
    const request = { kind: 'generate', difficulty: 'easy', seed: SEED }
    const first = await send(request)
    expect(await send(request)).toEqual(first)
    const result = ok(decodeGenerate(first))
    if (result.kind !== 'generated') throw new Error(result.kind)
    expect(result.puzzle).toHaveLength(BOARD_LENGTH)
    const validated = ok(decodeValidate(await send({ kind: 'validate', cells: result.puzzle })))
    expect(validated).toEqual({ kind: 'unique', solution: result.solution })
  })
})
