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

import { describe, expect, it, vi } from 'vitest'

import { bindWire } from './abi'
import { BOARD_LENGTH, encodeError } from './wire'

const INPUT_AT = 8
const OUTPUT_AT = 200
const ANSWER = [1, 2, 3]

/** A stand-in for the wasm exports that answers every call with `ANSWER`. */
function fakeExports(overrides: Record<string, unknown> = {}) {
  const memory = { buffer: new ArrayBuffer(1024) }
  const answer = vi.fn(() => {
    new Uint8Array(memory.buffer, OUTPUT_AT).set(ANSWER)
    return ANSWER.length
  })
  return {
    memory,
    wire_input: () => INPUT_AT,
    wire_output: () => OUTPUT_AT,
    wire_solve: answer,
    wire_validate: answer,
    wire_next_step: answer,
    wire_generate: answer,
    ...overrides,
  }
}

describe('bindWire', () => {
  it('refuses anything without every export', () => {
    expect(bindWire(undefined)).toBeNull()
    expect(bindWire(null)).toBeNull()
    expect(bindWire(fakeExports({ memory: { buffer: [] } }))).toBeNull()
    expect(bindWire(fakeExports({ memory: null }))).toBeNull()
    for (const name of ['wire_input', 'wire_output', 'wire_solve', 'wire_validate']) {
      expect(bindWire(fakeExports({ [name]: 0 }))).toBeNull()
    }
    expect(bindWire(fakeExports({ wire_next_step: undefined }))).toBeNull()
    expect(bindWire(fakeExports({ wire_generate: 'f' }))).toBeNull()
  })

  it('writes the board at the input and copies the answer out', () => {
    const exports = fakeExports()
    const wire = bindWire(exports)!
    const cells = new Uint8Array(BOARD_LENGTH).fill(7)
    for (const run of [wire.solve, wire.validate, wire.nextStep]) {
      const answer = run(cells)
      expect(answer).toEqual(Uint8Array.from(ANSWER))
      expect(answer.buffer).not.toBe(exports.memory.buffer)
    }
    expect(new Uint8Array(exports.memory.buffer, INPUT_AT, BOARD_LENGTH)).toEqual(cells)
  })

  it('answers a board of the wrong length as the solver would', () => {
    const wire = bindWire(fakeExports())!
    expect(wire.solve(new Uint8Array(3))).toEqual(encodeError('badLength'))
  })

  it('passes the difficulty code and the two halves of the seed', () => {
    const exports = fakeExports()
    bindWire(exports)!.generate('hard', 3 * 2 ** 32 + 5)
    expect(exports.wire_generate).toHaveBeenCalledWith(2, 5, 3)
  })

  it.each([-1, 0.5, 2 ** 53, Number.NaN])('refuses the seed %s', (seed) => {
    expect(() => bindWire(fakeExports())!.generate('easy', seed)).toThrow(RangeError)
  })

  it('throws if an export answers with something other than an address', () => {
    const wire = bindWire(fakeExports({ wire_output: () => -1 }))!
    expect(() => wire.solve(new Uint8Array(BOARD_LENGTH))).toThrow(TypeError)
    const odd = bindWire(fakeExports({ wire_validate: () => 'x' }))!
    expect(() => odd.validate(new Uint8Array(BOARD_LENGTH))).toThrow(TypeError)
  })
})
