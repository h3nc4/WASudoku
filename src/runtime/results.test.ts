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

import { describe, expect, it } from 'vitest'

import { boardToString, parseBoard } from '../core/board'
import type * as Wire from '../core/codec/wire.types'
import { cellsOf, decoded, fakeSolver } from '../test/runtime-fakes'
import {
  cellsToString,
  generatePooled,
  OUT_OF_RANGE,
  runTask,
  stringToCells,
  toReply,
  toSolveResult,
  toStep,
} from './results'

const PUZZLE = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79'
const SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
const BAD_CELLS = new Uint8Array(81).fill(12)
const REFUSED: Wire.Failed = { kind: 'error', error: 'noSolution' }

const W_WING_STEP: Wire.Step = {
  technique: 'W-Wing',
  placements: [],
  eliminations: [{ index: 10, value: 4 }],
  cause: [{ index: 0, candidates: [9, 4] }],
}

const solved = (steps: readonly Wire.Step[] = [], solution = cellsOf(SOLUTION)) =>
  decoded<Wire.SolveResult>({ kind: 'solved', steps, solution })

describe('puzzle strings', () => {
  it('write an empty cell as a dot, as the solver did before the wire format', () => {
    expect(cellsToString(cellsOf(PUZZLE))).toBe(PUZZLE)
  })

  it('read a dot or a zero as an empty cell', () => {
    expect(stringToCells('.0')).toEqual(Uint8Array.from([0, 0]))
    expect(stringToCells(PUZZLE)).toEqual(cellsOf(PUZZLE))
  })
})

describe('toStep', () => {
  it('names digits and turns cause candidates into a mask', () => {
    expect(toStep(W_WING_STEP)).toEqual({
      technique: 'W-Wing',
      placements: [],
      eliminations: [{ index: 10, digit: 4 }],
      cause: [{ index: 0, candidates: (1 << 8) | (1 << 3) }],
    })
  })

  it.each([
    ['a placement off the board', { ...W_WING_STEP, placements: [{ index: 81, value: 1 }] }],
    ['an elimination of no digit', { ...W_WING_STEP, eliminations: [{ index: 0, value: 0 }] }],
    ['a cause cell off the board', { ...W_WING_STEP, cause: [{ index: -1, candidates: [1] }] }],
    ['a cause candidate past 9', { ...W_WING_STEP, cause: [{ index: 0, candidates: [10] }] }],
    ['an unknown technique', { ...W_WING_STEP, technique: 'Guess' as Wire.Technique }],
  ])('refuses %s', (_, step) => {
    expect(toStep(step)).toBeNull()
  })
})

describe('toSolveResult', () => {
  it('parses the solution into a board of givens', () => {
    const result = toSolveResult([W_WING_STEP], cellsOf(SOLUTION))
    expect(result?.steps).toHaveLength(1)
    expect(result && boardToString(result.solution)).toBe(SOLUTION)
  })

  it('refuses a bad step or a solution out of range', () => {
    expect(
      toSolveResult([{ ...W_WING_STEP, technique: 'x' as Wire.Technique }], cellsOf(SOLUTION)),
    ).toBeNull()
    expect(toSolveResult([], BAD_CELLS)).toBeNull()
  })
})

describe('toReply', () => {
  it('answers a solve with the mapped steps and solution', () => {
    const reply = toReply(3, { kind: 'solve', decoded: solved([W_WING_STEP]) })
    expect(reply).toEqual({
      type: 'solved',
      id: 3,
      result: { steps: [toStep(W_WING_STEP)], solution: parseBoard(SOLUTION) },
    })
  })

  it.each([
    ['solve', { kind: 'solve', decoded: { ok: false, error: 'truncated' } }, 'truncated'],
    ['validate', { kind: 'validate', decoded: { ok: false, error: 'version' } }, 'version'],
    ['generate', { kind: 'generate', decoded: { ok: false, error: 'tag' } }, 'tag'],
  ] as const)('fails a %s whose bytes did not decode', (_, answer, reason) => {
    expect(toReply(1, answer)).toEqual({ type: 'failed', id: 1, reason })
  })

  it.each([
    ['solve', { kind: 'solve', decoded: decoded(REFUSED) }],
    ['validate', { kind: 'validate', decoded: decoded(REFUSED) }],
    ['generate', { kind: 'generate', decoded: decoded(REFUSED) }],
  ] as const)('fails a %s the solver refused with its error code', (_, answer) => {
    expect(toReply(2, answer)).toEqual({ type: 'failed', id: 2, reason: 'noSolution' })
  })

  it('fails results the core cannot hold as out of range', () => {
    const solve = toReply(1, { kind: 'solve', decoded: solved([], BAD_CELLS) })
    const unique = toReply(1, {
      kind: 'validate',
      decoded: decoded({ kind: 'unique', solution: BAD_CELLS }),
    })
    const generated = toReply(1, {
      kind: 'generate',
      decoded: decoded({
        kind: 'generated',
        difficulty: 'easy',
        puzzle: BAD_CELLS,
        solution: BAD_CELLS,
      }),
    })
    for (const reply of [solve, unique, generated]) {
      expect(reply).toEqual({ type: 'failed', id: 1, reason: OUT_OF_RANGE })
    }
  })

  it('validates a board with one solution', () => {
    const reply = toReply(4, {
      kind: 'validate',
      decoded: decoded({ kind: 'unique', solution: cellsOf(SOLUTION) }),
    })
    expect(reply).toEqual({ type: 'validated', id: 4, solution: parseBoard(SOLUTION) })
  })

  it.each([
    { kind: 'unsolvable' },
    { kind: 'several' },
    { kind: 'conflict', cells: [0, 1] },
  ] as const)('refuses a $kind board with a null solution', (result) => {
    expect(toReply(5, { kind: 'validate', decoded: decoded(result) })).toEqual({
      type: 'validated',
      id: 5,
      solution: null,
    })
  })

  it('answers a generate with puzzle strings', () => {
    const reply = toReply(6, {
      kind: 'generate',
      decoded: decoded({
        kind: 'generated',
        difficulty: 'hard',
        puzzle: cellsOf(PUZZLE),
        solution: cellsOf(SOLUTION),
      }),
    })
    expect(reply).toEqual({
      type: 'generated',
      id: 6,
      puzzle: { puzzleString: PUZZLE, solutionString: SOLUTION },
    })
  })
})

describe('runTask', () => {
  const options = { lane: 'foreground' } as const

  it.each([
    ['solve', { kind: 'solve', puzzle: PUZZLE }, { kind: 'solve', cells: cellsOf(PUZZLE) }],
    [
      'validate',
      { kind: 'validate', puzzle: PUZZLE },
      { kind: 'validate', cells: cellsOf(PUZZLE) },
    ],
    [
      'generate',
      { kind: 'generate', difficulty: 'medium' },
      { kind: 'generate', difficulty: 'medium', seed: 9 },
    ],
  ] as const)('sends a %s and tags its result with the kind', async (kind, task, sent) => {
    const solver = fakeSolver(() => Promise.resolve(decoded({ kind: 'several' })))
    const answer = await runTask(solver, task, () => 9, options)
    expect(solver.calls).toEqual([{ task: sent, options }])
    expect(answer).toEqual({ kind, decoded: decoded({ kind: 'several' }) })
  })
})

describe('generatePooled', () => {
  const generated = decoded<Wire.GenerateResult>({
    kind: 'generated',
    difficulty: 'expert',
    puzzle: cellsOf(PUZZLE),
    solution: cellsOf(SOLUTION),
  })

  it('generates on the background lane and tags the puzzle with its difficulty', async () => {
    const solver = fakeSolver(() => Promise.resolve(generated))
    await expect(generatePooled(solver, 'expert', 3)).resolves.toEqual({
      difficulty: 'expert',
      puzzleString: PUZZLE,
      solutionString: SOLUTION,
    })
    expect(solver.calls).toEqual([
      {
        task: { kind: 'generate', difficulty: 'expert', seed: 3 },
        options: { lane: 'background' },
      },
    ])
  })

  it.each([
    ['bytes that did not decode', { ok: false, error: 'trailing' }, 'trailing'],
    ['a refusal', decoded({ kind: 'error', error: 'badDifficulty' }), 'badDifficulty'],
    [
      'a board out of range',
      decoded({ kind: 'generated', difficulty: 'easy', puzzle: BAD_CELLS, solution: BAD_CELLS }),
      OUT_OF_RANGE,
    ],
  ])('rejects %s with its reason', async (_, answer, reason) => {
    const solver = fakeSolver(() => Promise.resolve(answer))
    await expect(generatePooled(solver, 'easy', 1)).rejects.toThrow(reason)
  })
})
