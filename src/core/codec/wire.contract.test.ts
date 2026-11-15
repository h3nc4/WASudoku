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

import { beforeAll, describe, expect, it } from 'vitest'
import { initSync, solve_sudoku, validate_puzzle } from 'wasudoku-wasm'

import { bindWire, type WireModule } from './abi'
import {
  BOARD_LENGTH,
  decodeGenerate,
  decodeHint,
  decodeSolve,
  decodeValidate,
  encodeGenerate,
  encodeHint,
  encodeSolve,
  encodeValidate,
} from './wire'
import type { Decoded, Step } from './wire.types'
import { DIFFICULTIES } from './wire.types'

// Runs the built crate, so this suite needs `npm run wasm:build:dev` first, as `npm run test` does.
const WASM_PATH = resolve('src/wasudoku-wasm/pkg/wasudoku_wasm_bg.wasm')
const GOLDEN = resolve('src/wasudoku-wasm/tests/golden/wire.txt')

const PUZZLE = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79'
const SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
const NORVIG = '.....5.8....6.1.43..........1.5........1.6...3.......553.....61........4.........'
const NEARLY_EMPTY = '8' + '.'.repeat(BOARD_LENGTH - 1)
const W_WING = '48.3............71.2.......7.5....6....2..8.............1.76...3.....4......5....'
const STALLS_LOGIC =
  '.....3....8..5.2..754.9.....62..1..8.7.....3.3..8..92.....3.415..9.4..6....6.....'
const CONFLICTING = '55' + '.'.repeat(BOARD_LENGTH - 2)
const SEED = 1

const cellsOf = (text: string) => Uint8Array.from(text, (c) => (c === '.' ? 0 : Number(c)))
const textOf = (cells: Uint8Array) => Array.from(cells, (d) => (d === 0 ? '.' : String(d))).join('')

function ok<T>(decoded: Decoded<T>): T {
  if (!decoded.ok) throw new Error(`decode failed: ${decoded.error}`)
  return decoded.result
}

interface LegacySolve {
  steps: Step[]
  solution: string
}

describe('wire exports of the real wasm', () => {
  let wire: WireModule
  let raw: ReturnType<typeof initSync>

  beforeAll(() => {
    raw = initSync({ module: readFileSync(WASM_PATH) })
    wire = bindWire(raw)!
  })

  const solve = (text: string) => wire.solve(cellsOf(text))

  describe('solve', () => {
    it.each([PUZZLE, NEARLY_EMPTY, W_WING, STALLS_LOGIC])(
      'returns the steps and solution the legacy export returns for %s',
      (text) => {
        const bytes = solve(text)
        const result = ok(decodeSolve(bytes))
        const legacy = solve_sudoku(text) as LegacySolve
        if (result.kind !== 'solved') throw new Error(result.kind)
        expect(textOf(result.solution)).toBe(legacy.solution)
        expect(result.steps).toEqual(legacy.steps)
        expect(encodeSolve(result)).toEqual(bytes)
      },
    )

    it('keeps the W-Wing cause candidates in emitted order', () => {
      const result = ok(decodeSolve(solve(W_WING)))
      if (result.kind !== 'solved') throw new Error(result.kind)
      const wWing = result.steps.find((step) => step.technique === 'W-Wing')!
      expect(wWing.cause[0]?.candidates).toEqual([9, 4])
    })

    it.each([
      ['noSolution', NORVIG],
      ['conflict', CONFLICTING],
    ])('reports %s', (error, text) => {
      expect(ok(decodeSolve(solve(text)))).toEqual({ kind: 'error', error })
    })

    it('reports a cell above 9', () => {
      const cells = new Uint8Array(BOARD_LENGTH).fill(10)
      expect(ok(decodeSolve(wire.solve(cells)))).toEqual({ kind: 'error', error: 'badDigit' })
    })

    // The ABI input is a fixed 81 bytes, so only the JS binding can see a board of another length.
    it('answers a short board in JS without writing to the wasm input', () => {
      solve(PUZZLE)
      const answer = wire.solve(new Uint8Array(3))
      const input = new Uint8Array(raw.memory.buffer, raw.wire_input(), BOARD_LENGTH)
      expect(ok(decodeSolve(answer))).toEqual({ kind: 'error', error: 'badLength' })
      expect(textOf(input)).toBe(PUZZLE)
    })
  })

  describe('validate', () => {
    const validate = (text: string) => ok(decodeValidate(wire.validate(cellsOf(text))))

    it('tells unique, unsolvable, several and conflicting boards apart', () => {
      const unique = validate(PUZZLE)
      expect(unique.kind === 'unique' && textOf(unique.solution)).toBe(SOLUTION)
      expect(validate(NORVIG)).toEqual({ kind: 'unsolvable' })
      expect(validate(NEARLY_EMPTY)).toEqual({ kind: 'several' })
      expect(validate(CONFLICTING)).toEqual({ kind: 'conflict', cells: [0, 1] })
    })

    it('agrees with the legacy export', () => {
      for (const text of [PUZZLE, NORVIG, NEARLY_EMPTY, STALLS_LOGIC]) {
        const result = validate(text)
        const legacy = validate_puzzle(text)
        expect(result.kind === 'unique' ? textOf(result.solution) : undefined).toBe(legacy)
        expect(encodeValidate(result)).toEqual(wire.validate(cellsOf(text)))
      }
    })
  })

  describe('next step', () => {
    const hint = (text: string) => ok(decodeHint(wire.nextStep(cellsOf(text))))

    it('is the first step of a solve', () => {
      for (const text of [PUZZLE, W_WING, STALLS_LOGIC]) {
        const solved = ok(decodeSolve(solve(text)))
        if (solved.kind !== 'solved') throw new Error(solved.kind)
        expect(hint(text)).toEqual({ kind: 'step', step: solved.steps[0] })
      }
    })

    it('reveals the solution when logic is stuck', () => {
      const stuck = hint(NEARLY_EMPTY)
      const solved = ok(decodeSolve(solve(NEARLY_EMPTY)))
      expect(stuck).toEqual({
        kind: 'stuck',
        solution: solved.kind === 'solved' && solved.solution,
      })
      expect(encodeHint(stuck)).toEqual(wire.nextStep(cellsOf(NEARLY_EMPTY)))
    })

    it('reports a board without a solution', () => {
      expect(hint(NORVIG)).toEqual({ kind: 'error', error: 'noSolution' })
    })
  })

  describe('generate', () => {
    const golden = new Map(
      readFileSync(GOLDEN, 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split(' ') as [string, string]),
    )
    const hex = (bytes: Uint8Array) =>
      Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

    it.each(DIFFICULTIES)('gives the seeded %s puzzle of the golden file', (difficulty) => {
      const bytes = wire.generate(difficulty, SEED)
      expect(hex(bytes)).toBe(golden.get(`generate-${difficulty}-seed-${String(SEED)}`))
      const result = ok(decodeGenerate(bytes))
      if (result.kind !== 'generated') throw new Error(result.kind)
      expect(result.difficulty).toBe(difficulty)
      result.puzzle.forEach((digit, i) => {
        if (digit !== 0) expect(result.solution[i]).toBe(digit)
      })
      const validated = ok(decodeValidate(wire.validate(result.puzzle)))
      expect(validated).toEqual({ kind: 'unique', solution: result.solution })
      expect(encodeGenerate(result)).toEqual(bytes)
    })

    it('answers a seed above 32 bits', () => {
      const result = ok(decodeGenerate(wire.generate('easy', 2 ** 40 + SEED)))
      expect(result.kind).toBe('generated')
    })

    it('reports an unknown difficulty code', () => {
      const length = raw.wire_generate(DIFFICULTIES.length, 0, 0)
      const bytes = new Uint8Array(raw.memory.buffer, raw.wire_output(), length).slice()
      expect(ok(decodeGenerate(bytes))).toEqual({ kind: 'error', error: 'badDifficulty' })
    })
  })
})
