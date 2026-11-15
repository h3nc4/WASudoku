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

import { beforeAll, describe, expect, it } from 'vitest'
import { generate_sudoku, initSync, solve_sudoku, validate_puzzle } from 'wasudoku-wasm'

import { boardToString } from '../core/board'
import { bindWire, type WireModule } from '../core/codec/abi'
import { decodeGenerate, decodeSolve, decodeValidate } from '../core/codec/wire'
import type * as Wire from '../core/codec/wire.types'
import { digitsOf, maskOf } from '../core/digits'
import type { SolverTask } from '../core/game/effects'
import type { SolverClient, Task } from '../solver/client'
import type { Reply } from './results'
import { runTask, toReply } from './results'

// Runs the built crate, so this suite needs `npm run wasm:build:dev` first, as `npm run test` does.
const WASM_PATH = resolve('src/wasudoku-wasm/pkg/wasudoku_wasm_bg.wasm')

// The contract suite's corpus, in src/core/codec/wire.contract.test.ts.
const PUZZLE = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79'
const NORVIG = '.....5.8....6.1.43..........1.5........1.6...3.......553.....61........4.........'
const NEARLY_EMPTY = '8' + '.'.repeat(80)
const W_WING = '48.3............71.2.......7.5....6....2..8.............1.76...3.....4......5....'
const STALLS_LOGIC =
  '.....3....8..5.2..754.9.....62..1..8.7.....3.3..8..92.....3.415..9.4..6....6.....'
const CONFLICTING = '55' + '.'.repeat(79)
const SOLVABLE = [PUZZLE, NEARLY_EMPTY, W_WING, STALLS_LOGIC]
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert', 'extreme'] as const
const SEEDS = [1, 2, 3]

interface LegacySolve {
  readonly steps: readonly Wire.Step[]
  readonly solution: string
}

let wire: WireModule
let client: SolverClient

/** The client's contract over the wire exports, run in this thread. */
function directClient(module: WireModule): SolverClient {
  const answer = (task: Task): unknown => {
    switch (task.kind) {
      case 'solve':
        return decodeSolve(module.solve(task.cells))
      case 'validate':
        return decodeValidate(module.validate(task.cells))
      case 'generate':
        return decodeGenerate(module.generate(task.difficulty, task.seed))
      case 'hint':
        throw new Error('the game asks for no hint task')
    }
  }
  return {
    run: (task) => Promise.resolve(answer(task)) as never,
    warm: () => undefined,
    dispose: () => undefined,
  }
}

const reply = async (task: SolverTask, seed = 1): Promise<Reply> =>
  toReply(1, await runTask(client, task, () => seed, {}))

beforeAll(() => {
  wire = bindWire(initSync({ module: readFileSync(WASM_PATH) }))!
  client = directClient(wire)
})

describe('wire results mapped onto core steps, against the real wasm', () => {
  it.each(SOLVABLE)('keeps every step and the solution of %s', async (puzzle) => {
    const legacy = solve_sudoku(puzzle) as LegacySolve
    const mapped = await reply({ kind: 'solve', puzzle })
    if (mapped.type !== 'solved') throw new Error(mapped.type)
    expect(boardToString(mapped.result.solution)).toBe(legacy.solution)
    expect(mapped.result.steps).toHaveLength(legacy.steps.length)
    mapped.result.steps.forEach((step, i) => {
      const original = legacy.steps[i]
      expect(step.technique).toBe(original.technique)
      expect(step.placements).toEqual(
        original.placements.map(({ index, value }) => ({ index, digit: value })),
      )
      expect(step.eliminations).toEqual(
        original.eliminations.map(({ index, value }) => ({ index, digit: value })),
      )
      expect(step.cause.map(({ index }) => index)).toEqual(original.cause.map(({ index }) => index))
      step.cause.forEach(({ candidates }, at) => {
        expect(candidates).toBe(maskOf(original.cause[at].candidates as never))
      })
    })
  })

  // A mask lists digits in ascending order. The solver emits every cause but W-Wing's in that order.
  it('loses the cause order of W-Wing alone, which no explanation reads', async () => {
    const reordered = new Set<string>()
    for (const puzzle of SOLVABLE) {
      const mapped = await reply({ kind: 'solve', puzzle })
      const legacy = solve_sudoku(puzzle) as LegacySolve
      if (mapped.type !== 'solved') throw new Error(mapped.type)
      mapped.result.steps.forEach((step, i) => {
        step.cause.forEach(({ candidates }, at) => {
          const emitted = legacy.steps[i].cause[at].candidates
          if (digitsOf(candidates).join() !== emitted.join()) reordered.add(step.technique)
        })
      })
    }
    expect([...reordered]).toEqual(['W-Wing'])
  })

  it.each([
    ['noSolution', NORVIG],
    ['conflict', CONFLICTING],
  ])('fails a solve the solver refuses with %s', async (reason, puzzle) => {
    expect(await reply({ kind: 'solve', puzzle })).toEqual({ type: 'failed', id: 1, reason })
  })

  it('validates what the legacy export validates, and refuses the rest with a null solution', async () => {
    for (const puzzle of [...SOLVABLE, NORVIG, CONFLICTING]) {
      const mapped = await reply({ kind: 'validate', puzzle })
      if (mapped.type !== 'validated') throw new Error(mapped.type)
      const legacy = puzzle === CONFLICTING ? undefined : validate_puzzle(puzzle)
      expect(mapped.solution === null ? undefined : boardToString(mapped.solution)).toBe(legacy)
    }
  })

  it.each(DIFFICULTIES)(
    'generates %s puzzles in the strings the legacy export wrote',
    async (difficulty) => {
      const legacy = generate_sudoku(difficulty) as { puzzle: string; solution: string }
      for (const seed of SEEDS) {
        const mapped = await reply({ kind: 'generate', difficulty }, seed)
        if (mapped.type !== 'generated') throw new Error(mapped.type)
        const { puzzleString, solutionString } = mapped.puzzle
        expect(puzzleString).toMatch(/^[1-9.]{81}$/)
        expect(solutionString).toMatch(/^[1-9]{81}$/)
        expect(legacy.puzzle).toMatch(/^[1-9.]{81}$/)
        expect(legacy.solution).toMatch(/^[1-9]{81}$/)
        expect(Array.from(puzzleString).every((c, i) => c === '.' || c === solutionString[i])).toBe(
          true,
        )
      }
    },
  )
})
