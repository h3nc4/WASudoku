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

import { BOARD_LENGTH, encodeError } from './wire'
import { DIFFICULTIES, type Difficulty } from './wire.types'

/** The solver module's wire exports, each answering with the bytes `wire.ts` decodes. */
export interface WireModule {
  readonly solve: (cells: Uint8Array) => Uint8Array
  readonly validate: (cells: Uint8Array) => Uint8Array
  readonly nextStep: (cells: Uint8Array) => Uint8Array
  /** The same puzzle for the same seed, a non-negative safe integer. */
  readonly generate: (difficulty: Difficulty, seed: number) => Uint8Array
}

type Export = (...args: readonly number[]) => unknown

/** The seed crosses the C ABI as two 32-bit halves. */
const SEED_HALF = 0x1_0000_0000

const isExport = (value: unknown): value is Export => typeof value === 'function'

interface Memory {
  readonly buffer: ArrayBuffer
}

// A tag check rather than instanceof, which fails for a buffer from another realm such as a test's jsdom.
const isMemory = (value: unknown): value is Memory =>
  typeof value === 'object' &&
  value !== null &&
  Object.prototype.toString.call(Reflect.get(value, 'buffer')) === '[object ArrayBuffer]'

/** An export's answer, which is a byte count or a pointer, or a `TypeError` for anything else. */
function address(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  throw new TypeError(`The solver module answered ${String(value)}, not an address`)
}

/** Binds the raw exports of an instance or of wasm-bindgen's init, or returns null if one is missing. */
export function bindWire(exports: unknown): WireModule | null {
  if (typeof exports !== 'object' || exports === null) return null
  const get = (name: string): unknown => Reflect.get(exports, name)
  const memory = get('memory')
  const input = get('wire_input')
  const output = get('wire_output')
  const solve = get('wire_solve')
  const validate = get('wire_validate')
  const nextStep = get('wire_next_step')
  const generate = get('wire_generate')
  if (
    !isMemory(memory) ||
    !isExport(input) ||
    !isExport(output) ||
    !isExport(solve) ||
    !isExport(validate) ||
    !isExport(nextStep) ||
    !isExport(generate)
  ) {
    return null
  }

  // Memory growth replaces the buffer, so each view is made after the call that may grow it.
  const read = (length: unknown): Uint8Array => {
    const bytes = address(length)
    return new Uint8Array(memory.buffer, address(output()), bytes).slice()
  }
  const onBoard = (run: Export) => (cells: Uint8Array) => {
    if (cells.length !== BOARD_LENGTH) return encodeError('badLength')
    new Uint8Array(memory.buffer, address(input()), BOARD_LENGTH).set(cells)
    return read(run())
  }

  return {
    solve: onBoard(solve),
    validate: onBoard(validate),
    nextStep: onBoard(nextStep),
    generate: (difficulty, seed) => {
      if (!Number.isSafeInteger(seed) || seed < 0) {
        throw new RangeError(`A seed is a non-negative safe integer, not ${String(seed)}`)
      }
      const code = DIFFICULTIES.indexOf(difficulty)
      return read(generate(code, seed % SEED_HALF, Math.floor(seed / SEED_HALF)))
    },
  }
}
