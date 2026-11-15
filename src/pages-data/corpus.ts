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

import type { CellIndex, Digit, Mask } from '../core/digits'
import { maskOf, toDigit } from '../core/digits'
import {
  type CauseCell,
  type CellDigit,
  isTechnique,
  type Step,
  type Technique,
} from '../core/game/steps'
import { toCellIndex } from '../core/geometry'
import golden from '../wasudoku-wasm/tests/golden/logical_steps.txt?raw'

/** One corpus puzzle and every logical step the Rust solver takes on it, in order. */
export interface CorpusPuzzle {
  readonly puzzle: string
  readonly steps: readonly Step[]
}

/** The Rust enum names that differ from the ids the wire and the app use. */
const RUST_NAMES: Readonly<Record<string, Technique>> = {
  XWing: 'X-Wing',
  XyWing: 'XY-Wing',
  XyzWing: 'XYZ-Wing',
  WWing: 'W-Wing',
}

const PUZZLE_LINE = /^PUZZLE (\S{81})$/
const STEP_LINE = /^(\S+) p(.*) e(.*) c(.*)$/
const CELL_DIGIT = /(\d+)=(\d+)/g
const CAUSE_CELL = /(\d+)=\[([\d, ]*)\]/g
const LIST_SEPARATOR = ', '

function techniqueOf(name: string): Technique {
  const technique = RUST_NAMES[name] ?? name
  if (!isTechnique(technique)) throw new Error(`unknown technique ${name}`)
  return technique
}

function cellOf(text: string): CellIndex {
  const index = toCellIndex(Number(text))
  if (index === null) throw new Error(`cell ${text} is off the board`)
  return index
}

function digitOf(text: string): Digit {
  const digit = toDigit(Number(text))
  if (digit === null) throw new Error(`${text} is no digit`)
  return digit
}

const cellDigits = (text: string): CellDigit[] =>
  Array.from(text.matchAll(CELL_DIGIT), ([, index = '', digit = '']) => ({
    index: cellOf(index),
    digit: digitOf(digit),
  }))

const candidatesOf = (list: string): Mask =>
  maskOf(list === '' ? [] : list.split(LIST_SEPARATOR).map(digitOf))

const causeCells = (text: string): CauseCell[] =>
  Array.from(text.matchAll(CAUSE_CELL), ([, index = '', list = '']) => ({
    index: cellOf(index),
    candidates: candidatesOf(list),
  }))

function parseStep(line: string): Step {
  const [, name = '', placements = '', eliminations = '', cause = ''] = STEP_LINE.exec(line) ?? []
  if (name === '') throw new Error(`no step in "${line}"`)
  return {
    technique: techniqueOf(name),
    placements: cellDigits(placements),
    eliminations: cellDigits(eliminations),
    cause: causeCells(cause),
  }
}

/** Reads the golden step dump the Rust tests write, which pins every step of every puzzle. */
export function parseCorpus(text: string): CorpusPuzzle[] {
  const puzzles: { puzzle: string; steps: Step[] }[] = []
  for (const line of text.split('\n')) {
    if (line === '') continue
    const puzzle = PUZZLE_LINE.exec(line)?.[1]
    if (puzzle !== undefined) {
      puzzles.push({ puzzle, steps: [] })
      continue
    }
    const current = puzzles.at(-1)
    if (current === undefined) throw new Error(`a step before any puzzle: "${line}"`)
    current.steps.push(parseStep(line))
  }
  return puzzles
}

export const CORPUS: readonly CorpusPuzzle[] = parseCorpus(golden)
