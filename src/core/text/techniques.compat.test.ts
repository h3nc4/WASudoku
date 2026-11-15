/*
 * Copyright (C) 2025-2026  Henrique Almeida
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

// Cross-checks the ported text against today's components over every step the corpus solves to.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { initSync, solve_sudoku } from 'wasudoku-wasm'

import { StepEntry } from '@/components/SolverTrace'
import type { Hint as LegacyHint, SolvingStep } from '@/context/sudoku.types'
import { getHintExplanation, getStepExplanation, getTechniqueName } from '@/lib/techniques'
import { formatCell as legacyCell, formatTime as legacyTime } from '@/lib/utils'

import { type CellIndex, type Digit, maskOf } from '../digits'
import { BACKTRACKING_STEP, type Hint, type Step, TECHNIQUES } from '../game/steps'
import { formatCell, formatTime } from './format'
import { explainHint, explainStep, techniqueName, traceText } from './techniques'

// Runs the built crate, so this suite needs `npm run wasm:build:dev` first, as `npm run test` does.
const WASM_PATH = resolve('src/wasudoku-wasm/pkg/wasudoku_wasm_bg.wasm')
const CORPUS = resolve('src/wasudoku-wasm/tests/golden/logical_steps.txt')
const PUZZLE_LINE = /^PUZZLE (\S{81})$/
// Renders some 800 trace lines through React, which coverage slows past the default 5s.
const RENDER_TIMEOUT_MS = 60_000

/** Techniques whose pattern is one digit. Their text reads the first candidate of a cause. */
const ONE_DIGIT = new Set<string>([
  'PointingPair',
  'PointingTriple',
  'ClaimingCandidate',
  'X-Wing',
  'Swordfish',
  'Jellyfish',
  'Skyscraper',
  'TwoStringKite',
])

const puzzles = readFileSync(CORPUS, 'utf8')
  .split('\n')
  .flatMap((line) => PUZZLE_LINE.exec(line)?.[1] ?? [])

/** The game's form of a legacy step, with each cause's candidates as a mask. */
const toStep = (legacy: SolvingStep): Step => ({
  technique: legacy.technique,
  placements: legacy.placements.map((p) => ({
    index: p.index as CellIndex,
    digit: p.value as Digit,
  })),
  eliminations: legacy.eliminations.map((e) => ({
    index: e.index as CellIndex,
    digit: e.value as Digit,
  })),
  cause: legacy.cause.map((c) => ({
    index: c.index as CellIndex,
    candidates: maskOf(c.candidates as Digit[]),
  })),
})

/** The where and label spans of today's trace line. */
function legacyTrace(step: SolvingStep, withValue: boolean) {
  const line = createElement(StepEntry, { tag: '01', step, withValue })
  const doc = new DOMParser().parseFromString(renderToStaticMarkup(line), 'text/html')
  const spans = doc.querySelectorAll('span')
  const [, where, label] = [...spans].map((span) => span.textContent)
  return { where, label }
}

describe('the ported text against the solver corpus', () => {
  let steps: SolvingStep[] = []

  beforeAll(() => {
    initSync({ module: readFileSync(WASM_PATH) })
    steps = puzzles.flatMap((puzzle) => (solve_sudoku(puzzle) as { steps: SolvingStep[] }).steps)
    steps.push({ ...BACKTRACKING_STEP, placements: [], eliminations: [], cause: [] })
  })

  it('reaches every technique the solver emits, and backtracking', () => {
    expect(puzzles.length).toBeGreaterThan(0)
    expect(new Set(steps.map((step) => step.technique))).toEqual(new Set(TECHNIQUES))
  })

  it('explains every step as today does', () => {
    for (const step of steps) expect(explainStep(toStep(step))).toBe(getStepExplanation(step))
  })

  it('names every technique as today does', () => {
    for (const technique of TECHNIQUES) {
      expect(techniqueName(technique)).toBe(getTechniqueName(technique))
    }
  })

  it(
    'writes every trace line as today does, with and without the value',
    () => {
      for (const step of steps) {
        for (const withValue of [true, false]) {
          const { where, label } = legacyTrace(step, withValue)
          expect(traceText(toStep(step), withValue)).toEqual({ where, label })
        }
      }
    },
    RENDER_TIMEOUT_MS,
  )

  it('explains hints of every kind as today does', () => {
    const index = 40
    const cases: [Hint, LegacyHint][] = [
      [
        { kind: 'mistake', index: index as CellIndex },
        { kind: 'mistake', index },
      ],
      [
        { kind: 'reveal', index: index as CellIndex, digit: 7 },
        { kind: 'reveal', index, value: 7 },
      ],
      ...steps.map((step): [Hint, LegacyHint] => [
        { kind: 'step', step: toStep(step) },
        { kind: 'step', step },
      ]),
    ]
    for (const [hint, legacy] of cases) expect(explainHint(hint)).toBe(getHintExplanation(legacy))
  })

  // The wire keeps a W-Wing's candidates in the finder's order, which the game's mask drops.
  it('reads no step differently when its cause candidates are reordered', () => {
    const reorder = (step: SolvingStep): SolvingStep => ({
      ...step,
      cause: step.cause.map((c) => ({ ...c, candidates: [...c.candidates].reverse() })),
    })
    const wWings = steps.filter((step) => step.technique === 'W-Wing')
    expect(
      wWings.some((step) =>
        step.cause.some((c) => c.candidates.join() !== [...c.candidates].sort().join()),
      ),
    ).toBe(true)
    for (const step of steps) {
      expect(getStepExplanation(reorder(step))).toBe(getStepExplanation(step))
    }
  })

  it('finds one digit in each cause of a one-digit pattern', () => {
    const patterns = steps.filter((step) => ONE_DIGIT.has(step.technique))
    expect(new Set(patterns.map((step) => step.technique))).toEqual(ONE_DIGIT)
    for (const step of patterns) {
      for (const cause of step.cause) expect(cause.candidates).toHaveLength(1)
    }
  })
})

describe('the ported formats', () => {
  it('names every cell as today', () => {
    for (let index = 0; index < 81; index++) expect(formatCell(index)).toBe(legacyCell(index))
  })

  it('writes the clock as today', () => {
    for (const seconds of [0, 9, 59, 60, 61, 599, 3599, 3600, 5999, 6000, 36_061]) {
      expect(formatTime(seconds)).toBe(legacyTime(seconds))
    }
  })
})
