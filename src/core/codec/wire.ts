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

import {
  API_ERRORS,
  type ApiError,
  type CellDigit,
  type Cells,
  type Decoded,
  DIFFICULTIES,
  type Failed,
  type GenerateResult,
  type HintResult,
  type SolveResult,
  type Step,
  TECHNIQUES,
  type ValidateResult,
  type WireError,
} from './wire.types'

/** The layout version, the first byte of every result. */
export const WIRE_VERSION = 1
/** The cells of a board, and the bytes it takes. */
export const BOARD_LENGTH = 81

/** The kind of a result, its second byte, as `wire::Tag` in Rust numbers them. */
export const TAG = {
  error: 0,
  solved: 1,
  unique: 2,
  unsolvable: 3,
  several: 4,
  conflict: 5,
  generated: 6,
  step: 7,
  stuck: 8,
} as const

const LAST_CELL = BOARD_LENGTH - 1
const MAX_DIGIT = 9
/** The longest list one count byte describes. */
const MAX_LIST = 0xff
/** The most steps the `u16` count describes. */
const MAX_STEPS = 0xffff
const BYTE_BITS = 8
const BYTE_MASK = 0xff
/** API error codes start at 1. */
const ERROR_CODE_BASE = 1

/** Reads bytes in order, noting the first fault and reading zeros past the end instead of throwing. */
class Reader {
  private at = 0
  fault: WireError | null = null
  private readonly bytes: Uint8Array

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }

  private fail(fault: WireError): void {
    this.fault ??= fault
  }

  byte(): number {
    const value = this.bytes.at(this.at)
    this.at += 1
    if (value !== undefined) return value
    this.fail('truncated')
    return 0
  }

  within(min: number, max: number): number {
    const value = this.byte()
    if (value < min || value > max) this.fail('range')
    return value
  }

  cell = (): number => this.within(0, LAST_CELL)
  digit = (): number => this.within(1, MAX_DIGIT)

  /** A board, whose cells may be empty only when `empty` allows it. */
  board(empty: boolean): Cells {
    const min = empty ? 0 : 1
    const cells = this.bytes.slice(this.at, this.at + BOARD_LENGTH)
    this.at += BOARD_LENGTH
    if (cells.length < BOARD_LENGTH) this.fail('truncated')
    for (const digit of cells) if (digit < min || digit > MAX_DIGIT) this.fail('range')
    return cells
  }

  /** `count` items, or a count byte and that many when no count is given. */
  list<T>(item: () => T, count = this.byte()): T[] {
    const items: T[] = []
    for (let i = 0; i < count; i++) items.push(item())
    return items
  }

  u16(): number {
    const low = this.byte()
    return low | (this.byte() << BYTE_BITS)
  }

  /** The entry of `table` at `code`, or `fallback` with a range fault. */
  of<T>(table: readonly T[], code: number, fallback: T): T {
    const value = table[code]
    if (value !== undefined) return value
    this.fail('range')
    return fallback
  }

  cellDigit = (): CellDigit => ({ index: this.cell(), value: this.digit() })

  step = (): Step => ({
    technique: this.of(TECHNIQUES, this.byte(), 'NakedSingle'),
    placements: this.list(this.cellDigit),
    eliminations: this.list(this.cellDigit),
    cause: this.list(() => ({ index: this.cell(), candidates: this.list(this.digit) })),
  })

  end(): void {
    if (this.at !== this.bytes.length) this.fail('trailing')
  }
}

/** Reads the header and hands the body to `body`, which answers undefined for a tag it does not take. */
function decode<T>(
  bytes: Uint8Array,
  body: (tag: number, reader: Reader) => T | undefined,
): Decoded<T | Failed> {
  const reader = new Reader(bytes)
  if (reader.byte() !== WIRE_VERSION) return { ok: false, error: 'version' }
  const tag = reader.byte()
  const result: T | Failed | undefined =
    tag === TAG.error
      ? {
          kind: 'error',
          error: reader.of(API_ERRORS, reader.byte() - ERROR_CODE_BASE, 'badLength'),
        }
      : body(tag, reader)
  if (result === undefined) return { ok: false, error: 'tag' }
  reader.end()
  return reader.fault === null ? { ok: true, result } : { ok: false, error: reader.fault }
}

export function decodeSolve(bytes: Uint8Array): Decoded<SolveResult> {
  return decode(bytes, (tag, r) => {
    if (tag !== TAG.solved) return undefined
    const solution = r.board(false)
    return { kind: 'solved', solution, steps: r.list(r.step, r.u16()) }
  })
}

export function decodeValidate(bytes: Uint8Array): Decoded<ValidateResult> {
  return decode<ValidateResult>(bytes, (tag, r) => {
    switch (tag) {
      case TAG.unique:
        return { kind: 'unique', solution: r.board(false) }
      case TAG.unsolvable:
        return { kind: 'unsolvable' }
      case TAG.several:
        return { kind: 'several' }
      case TAG.conflict:
        return { kind: 'conflict', cells: r.list(r.cell) }
      default:
        return undefined
    }
  })
}

export function decodeGenerate(bytes: Uint8Array): Decoded<GenerateResult> {
  return decode(bytes, (tag, r) => {
    if (tag !== TAG.generated) return undefined
    const difficulty = r.of(DIFFICULTIES, r.byte(), 'easy')
    const puzzle = r.board(true)
    return { kind: 'generated', difficulty, puzzle, solution: r.board(false) }
  })
}

export function decodeHint(bytes: Uint8Array): Decoded<HintResult> {
  return decode<HintResult>(bytes, (tag, r) => {
    if (tag === TAG.step) return { kind: 'step', step: r.step() }
    if (tag === TAG.stuck) return { kind: 'stuck', solution: r.board(false) }
    return undefined
  })
}

class Writer {
  private readonly bytes: number[]

  constructor(tag: number) {
    this.bytes = [WIRE_VERSION, tag]
  }

  byte(value: number): this {
    this.bytes.push(value)
    return this
  }

  board(cells: Cells): this {
    this.bytes.push(...cells)
    return this
  }

  list<T>(items: readonly T[], item: (value: T) => void): this {
    const kept = items.slice(0, MAX_LIST)
    this.byte(kept.length)
    kept.forEach(item)
    return this
  }

  cellDigits(items: readonly CellDigit[]): this {
    return this.list(items, ({ index, value }) => this.byte(index).byte(value))
  }

  step(step: Step): this {
    this.byte(TECHNIQUES.indexOf(step.technique))
    this.cellDigits(step.placements).cellDigits(step.eliminations)
    return this.list(step.cause, ({ index, candidates }) => {
      this.byte(index).list(candidates, (d) => this.byte(d))
    })
  }

  done(): Uint8Array {
    return Uint8Array.from(this.bytes)
  }
}

// Kept apart from Writer, so the worker glue that imports only this bundles no encoder.
export function encodeError(error: ApiError): Uint8Array {
  return Uint8Array.of(WIRE_VERSION, TAG.error, API_ERRORS.indexOf(error) + ERROR_CODE_BASE)
}

export function encodeSolve(result: SolveResult): Uint8Array {
  if (result.kind === 'error') return encodeError(result.error)
  const steps = result.steps.slice(0, MAX_STEPS)
  const w = new Writer(TAG.solved).board(result.solution)
  w.byte(steps.length & BYTE_MASK).byte(steps.length >> BYTE_BITS)
  for (const step of steps) w.step(step)
  return w.done()
}

export function encodeValidate(result: ValidateResult): Uint8Array {
  switch (result.kind) {
    case 'unique':
      return new Writer(TAG.unique).board(result.solution).done()
    case 'unsolvable':
      return new Writer(TAG.unsolvable).done()
    case 'several':
      return new Writer(TAG.several).done()
    case 'conflict': {
      const w = new Writer(TAG.conflict)
      return w.list(result.cells, (i) => w.byte(i)).done()
    }
    case 'error':
      return encodeError(result.error)
  }
}

export function encodeGenerate(result: GenerateResult): Uint8Array {
  if (result.kind === 'error') return encodeError(result.error)
  const w = new Writer(TAG.generated).byte(DIFFICULTIES.indexOf(result.difficulty))
  return w.board(result.puzzle).board(result.solution).done()
}

export function encodeHint(result: HintResult): Uint8Array {
  switch (result.kind) {
    case 'step':
      return new Writer(TAG.step).step(result.step).done()
    case 'stuck':
      return new Writer(TAG.stuck).board(result.solution).done()
    case 'error':
      return encodeError(result.error)
  }
}
