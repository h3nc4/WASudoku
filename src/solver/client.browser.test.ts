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

import { afterAll, describe, expect, it } from 'vitest'

import type { Decoded } from '../core/codec/wire.types'
import { createSolverClient, SolverError } from './client'

const PUZZLE = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79'
const SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
const SEED = 1

const cellsOf = (text: string) => Uint8Array.from(text, (c) => (c === '.' ? 0 : Number(c)))
const textOf = (cells: Uint8Array) => Array.from(cells, (d) => (d === 0 ? '.' : String(d))).join('')

function ok<T>(decoded: Decoded<T>): T {
  if (!decoded.ok) throw new Error(`decode failed: ${decoded.error}`)
  return decoded.result
}

describe('the solver client in a real worker', () => {
  const client = createSolverClient()

  afterAll(() => {
    client.dispose()
  })

  it('solves on the foreground worker started by warm()', async () => {
    client.warm()
    const result = ok(await client.run({ kind: 'solve', cells: cellsOf(PUZZLE) }))
    expect(result.kind === 'solved' && textOf(result.solution)).toBe(SOLUTION)
    expect(result.kind === 'solved' && result.steps.length).toBeGreaterThan(0)
  })

  it('validates and hints', async () => {
    const validated = ok(await client.run({ kind: 'validate', cells: cellsOf(PUZZLE) }))
    expect(validated.kind === 'unique' && textOf(validated.solution)).toBe(SOLUTION)
    const hint = ok(await client.run({ kind: 'hint', cells: cellsOf(PUZZLE) }))
    expect(hint.kind).toBe('step')
  })

  it('generates the same puzzle for the same seed on either lane', async () => {
    const task = { kind: 'generate', difficulty: 'medium', seed: SEED } as const
    // Background first, so the background worker is busy and no copy with another seed joins.
    const [background, foreground] = await Promise.all([
      client.run(task, { lane: 'background' }),
      client.run(task),
    ])
    expect(foreground).toEqual(background)
    const generated = ok(foreground)
    if (generated.kind !== 'generated') throw new Error(generated.kind)
    const validated = ok(await client.run({ kind: 'validate', cells: generated.puzzle }))
    expect(validated).toEqual({ kind: 'unique', solution: generated.solution })
  })

  it('replaces a worker cancelled mid-task and answers the next task', async () => {
    const controller = new AbortController()
    const running = client.run(
      { kind: 'generate', difficulty: 'expert', seed: SEED },
      { signal: controller.signal },
    )
    controller.abort()
    await expect(running).rejects.toBeInstanceOf(SolverError)
    const result = ok(await client.run({ kind: 'validate', cells: cellsOf(PUZZLE) }))
    expect(result.kind).toBe('unique')
  })
})
