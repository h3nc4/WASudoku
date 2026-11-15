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

/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  BOARD_LENGTH,
  decodeGenerate,
  decodeHint,
  decodeSolve,
  decodeValidate,
  encodeError,
  encodeGenerate,
  encodeHint,
  encodeSolve,
  encodeValidate,
  TAG,
  WIRE_VERSION,
} from './wire'
import type { Decoded, GenerateResult, HintResult, SolveResult, Step } from './wire.types'
import { API_ERRORS, DIFFICULTIES, TECHNIQUES } from './wire.types'

const GOLDEN = resolve('src/wasudoku-wasm/tests/golden/wire.txt')

const board = (digit: number) => new Uint8Array(BOARD_LENGTH).fill(digit)
const bytes = (...values: number[]) => Uint8Array.from(values)

const STEP: Step = {
  technique: 'W-Wing',
  placements: [{ index: 80, value: 9 }],
  eliminations: [
    { index: 3, value: 4 },
    { index: 4, value: 4 },
  ],
  cause: [
    { index: 7, candidates: [9, 4] },
    { index: 0, candidates: [4] },
  ],
}

function ok<T>(decoded: Decoded<T>): T {
  if (!decoded.ok) throw new Error(`decode failed: ${decoded.error}`)
  return decoded.result
}

const solved: SolveResult = { kind: 'solved', steps: [STEP, STEP], solution: board(5) }
const generated: GenerateResult = {
  kind: 'generated',
  difficulty: 'expert',
  puzzle: board(0),
  solution: board(9),
}
const step: HintResult = { kind: 'step', step: STEP }

describe('wire format', () => {
  it('lays a step out as Rust does, keeping cause candidate order', () => {
    expect(encodeHint(step)).toEqual(
      bytes(WIRE_VERSION, TAG.step, 17, 1, 80, 9, 2, 3, 4, 4, 4, 2, 7, 2, 9, 4, 0, 1, 4),
    )
  })

  it('round-trips every kind of result', () => {
    expect(ok(decodeSolve(encodeSolve(solved)))).toEqual(solved)
    expect(ok(decodeGenerate(encodeGenerate(generated)))).toEqual(generated)
    expect(ok(decodeHint(encodeHint(step)))).toEqual(step)
    const stuck: HintResult = { kind: 'stuck', solution: board(3) }
    expect(ok(decodeHint(encodeHint(stuck)))).toEqual(stuck)
    for (const result of [
      { kind: 'unique', solution: board(1) },
      { kind: 'unsolvable' },
      { kind: 'several' },
      { kind: 'conflict', cells: [0, 1, 80] },
    ] as const) {
      expect(ok(decodeValidate(encodeValidate(result)))).toEqual(result)
    }
  })

  it.each(API_ERRORS)('carries the %s error through every decoder', (error) => {
    const failed = { kind: 'error', error } as const
    expect(ok(decodeSolve(encodeSolve(failed)))).toEqual(failed)
    expect(ok(decodeValidate(encodeValidate(failed)))).toEqual(failed)
    expect(ok(decodeGenerate(encodeGenerate(failed)))).toEqual(failed)
    expect(ok(decodeHint(encodeHint(failed)))).toEqual(failed)
    expect(encodeError(error)).toEqual(
      bytes(WIRE_VERSION, TAG.error, API_ERRORS.indexOf(error) + 1),
    )
  })

  it('codes each technique and difficulty by its index', () => {
    expect(TECHNIQUES).toHaveLength(18)
    for (const [code, technique] of TECHNIQUES.entries()) {
      expect(encodeHint({ kind: 'step', step: { ...STEP, technique } })[2]).toBe(code)
    }
    for (const [code, difficulty] of DIFFICULTIES.entries()) {
      expect(encodeGenerate({ ...generated, difficulty })[2]).toBe(code)
    }
  })

  it('refuses another version, including an empty buffer', () => {
    const solvedBytes = encodeSolve(solved)
    solvedBytes[0] = WIRE_VERSION + 1
    expect(decodeSolve(solvedBytes)).toEqual({ ok: false, error: 'version' })
    expect(decodeSolve(bytes())).toEqual({ ok: false, error: 'version' })
  })

  it('refuses a tag the decoder does not take', () => {
    const unique = encodeValidate({ kind: 'several' })
    expect(decodeSolve(unique)).toEqual({ ok: false, error: 'tag' })
    expect(decodeValidate(encodeSolve(solved))).toEqual({ ok: false, error: 'tag' })
    expect(decodeGenerate(unique)).toEqual({ ok: false, error: 'tag' })
    expect(decodeHint(unique)).toEqual({ ok: false, error: 'tag' })
  })

  it('refuses a buffer cut short at any byte', () => {
    const full = encodeSolve(solved)
    for (let length = 1; length < full.length; length++) {
      expect(decodeSolve(full.slice(0, length))).toEqual({ ok: false, error: 'truncated' })
    }
  })

  it('refuses bytes after the end', () => {
    const extra = Uint8Array.from([...encodeHint(step), 0])
    expect(decodeHint(extra)).toEqual({ ok: false, error: 'trailing' })
  })

  it.each([
    ['a cell index past the board', 4, 81],
    ['a placed digit of 0', 5, 0],
    ['an eliminated digit of 10', 8, 10],
    ['a candidate of 0', 15, 0],
    ['an unknown technique', 2, TECHNIQUES.length],
  ])('refuses %s', (_, offset, value) => {
    const wrong = encodeHint(step)
    wrong[offset] = value
    expect(decodeHint(wrong)).toEqual({ ok: false, error: 'range' })
  })

  it('refuses boards, difficulties and error codes out of range', () => {
    const range = { ok: false, error: 'range' }
    const generate = encodeGenerate(generated)
    generate[2] = DIFFICULTIES.length
    expect(decodeGenerate(generate)).toEqual(range)
    const puzzle = encodeGenerate(generated)
    puzzle[3] = 10
    expect(decodeGenerate(puzzle)).toEqual(range)
    const solution = encodeValidate({ kind: 'unique', solution: board(1) })
    solution[2] = 0
    expect(decodeValidate(solution)).toEqual(range)
    expect(decodeSolve(bytes(WIRE_VERSION, TAG.error, 0))).toEqual(range)
    expect(decodeSolve(bytes(WIRE_VERSION, TAG.error, API_ERRORS.length + 1))).toEqual(range)
  })

  it('keeps every list inside its count byte and the steps inside their u16', () => {
    const many = Array.from({ length: 300 }, () => ({ index: 1, value: 1 }))
    const long = encodeHint({ kind: 'step', step: { ...STEP, eliminations: many } })
    const decoded = ok(decodeHint(long))
    expect(decoded.kind === 'step' && decoded.step.eliminations).toHaveLength(255)
    const steps = Array.from({ length: 0x10000 }, () => STEP)
    const solve = ok(decodeSolve(encodeSolve({ ...solved, steps })))
    expect(solve.kind === 'solved' && solve.steps).toHaveLength(0xffff)
  })
})

describe('golden file shared with the Rust encoder', () => {
  const lines = readFileSync(GOLDEN, 'utf8').trim().split('\n')
  const cases = lines.map((line) => {
    const [name = '', hex = ''] = line.split(' ')
    return { name, bytes: Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16)) }
  })
  const codecs = {
    solve: (b: Uint8Array) => encodeSolve(ok(decodeSolve(b))),
    validate: (b: Uint8Array) => encodeValidate(ok(decodeValidate(b))),
    generate: (b: Uint8Array) => encodeGenerate(ok(decodeGenerate(b))),
    hint: (b: Uint8Array) => encodeHint(ok(decodeHint(b))),
  }

  it.each(cases)('decodes $name and encodes it back to the same bytes', ({ name, bytes }) => {
    const kind = name.split('-')[0] as keyof typeof codecs
    expect(codecs[kind](bytes)).toEqual(bytes)
  })

  it('keeps the W-Wing cause candidates in the order the finder gave them', () => {
    const wWing = cases.find((c) => c.name === 'solve-w-wing')!
    const result = ok(decodeSolve(wWing.bytes))
    if (result.kind !== 'solved') throw new Error(result.kind)
    const step = result.steps.find((s) => s.technique === 'W-Wing')!
    const first = step.cause.at(0)
    expect(first?.candidates).toHaveLength(2)
    expect(first?.candidates[1]).toBe(step.eliminations[0]?.value)
  })
})
