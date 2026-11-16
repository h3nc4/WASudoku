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

import { type Board, parseBoard } from '../core/board'
import type * as Wire from '../core/codec/wire.types'
import { type Digit, maskOf, toDigit } from '../core/digits'
import type { SolverTask } from '../core/game/effects'
import type { SystemEvent } from '../core/game/events'
import {
  type CauseCell,
  type CellDigit,
  isTechnique,
  type SolveResult,
  type Step,
} from '../core/game/steps'
import { toCellIndex } from '../core/geometry'
import type { Difficulty, PooledPuzzle, PuzzleData } from '../core/pool'
import type { RunOptions, SolverClient } from '../solver/client'

/** A solver reply as the game reads it. */
export type Reply = Extract<SystemEvent, { readonly id: number }>

const EMPTY_CELL = '.'
const EMPTY_CODE = 0

/** The decoder checks every range, so a value this mapping refuses means the two disagree. */
export const OUT_OF_RANGE = 'range'

/** Puzzle strings as the solver wrote them before the wire format, `.` for an empty cell. */
export const cellsToString = (cells: Wire.Cells): string =>
  Array.from(cells, (code) => (code === EMPTY_CODE ? EMPTY_CELL : String(code))).join('')

export const stringToCells = (puzzle: string): Wire.Cells =>
  Uint8Array.from(puzzle, (char) => (char === EMPTY_CELL ? EMPTY_CODE : Number(char)))

const toBoard = (cells: Wire.Cells): Board | null => parseBoard(cellsToString(cells))

function cellDigit({ index, value }: Wire.CellDigit): CellDigit | null {
  const cell = toCellIndex(index)
  const digit = toDigit(value)
  return cell === null || digit === null ? null : { index: cell, digit }
}

function mask(candidates: readonly number[]): number | null {
  const digits = candidates.map(toDigit)
  return digits.every((digit): digit is Digit => digit !== null) ? maskOf(digits) : null
}

function causeCell({ index, candidates }: Wire.Cause): CauseCell | null {
  const cell = toCellIndex(index)
  const digits = mask(candidates)
  return cell === null || digits === null ? null : { index: cell, candidates: digits }
}

const all = <T>(items: readonly (T | null)[]): readonly T[] | null =>
  items.every((item): item is T => item !== null) ? items : null

/** A step of the wire as the core keeps it. Cause candidates become a mask, which drops their order. */
export function toStep(step: Wire.Step): Step | null {
  const placements = all(step.placements.map(cellDigit))
  const eliminations = all(step.eliminations.map(cellDigit))
  const cause = all(step.cause.map(causeCell))
  if (
    !isTechnique(step.technique) ||
    placements === null ||
    eliminations === null ||
    cause === null
  ) {
    return null
  }
  return { technique: step.technique, placements, eliminations, cause }
}

export function toSolveResult(
  steps: readonly Wire.Step[],
  solution: Wire.Cells,
): SolveResult | null {
  const mapped = all(steps.map(toStep))
  const board = toBoard(solution)
  return mapped === null || board === null ? null : { steps: mapped, solution: board }
}

const failed = (id: number, reason: string): Reply => ({ type: 'failed', id, reason })

function solved(id: number, result: Wire.SolveResult): Reply {
  if (result.kind === 'error') return failed(id, result.error)
  const mapped = toSolveResult(result.steps, result.solution)
  return mapped === null ? failed(id, OUT_OF_RANGE) : { type: 'solved', id, result: mapped }
}

/** Only a board with one solution validates, and any other answer refuses it. */
function validated(id: number, result: Wire.ValidateResult): Reply {
  switch (result.kind) {
    case 'error':
      return failed(id, result.error)
    case 'unique': {
      const solution = toBoard(result.solution)
      return solution === null ? failed(id, OUT_OF_RANGE) : { type: 'validated', id, solution }
    }
    case 'unsolvable':
    case 'several':
    case 'conflict':
      return { type: 'validated', id, solution: null }
  }
}

function generated(id: number, result: Wire.GenerateResult): Reply {
  if (result.kind === 'error') return failed(id, result.error)
  const puzzle = toPuzzle(result.puzzle, result.solution)
  return puzzle === null ? failed(id, OUT_OF_RANGE) : { type: 'generated', id, puzzle }
}

/** The pool's form of a generated puzzle, or null when either board is out of range. */
export function toPuzzle(puzzle: Wire.Cells, solution: Wire.Cells): PuzzleData | null {
  const puzzleString = cellsToString(puzzle)
  const solutionString = cellsToString(solution)
  return parseBoard(puzzleString) === null || parseBoard(solutionString) === null
    ? null
    : { puzzleString, solutionString }
}

/** Results by the kind of task that produced them. */
export type Answer =
  | { readonly kind: 'solve'; readonly decoded: Wire.Decoded<Wire.SolveResult> }
  | { readonly kind: 'validate'; readonly decoded: Wire.Decoded<Wire.ValidateResult> }
  | { readonly kind: 'generate'; readonly decoded: Wire.Decoded<Wire.GenerateResult> }

/** Runs a game's request on the client. Each result is tagged with the kind of task it answers. */
export function runTask(
  client: SolverClient,
  task: SolverTask,
  seed: () => number,
  options: RunOptions,
): Promise<Answer> {
  switch (task.kind) {
    case 'solve':
    case 'validate': {
      const cells = stringToCells(task.puzzle)
      return task.kind === 'solve'
        ? client
            .run({ kind: 'solve', cells }, options)
            .then((decoded) => ({ kind: 'solve', decoded }))
        : client
            .run({ kind: 'validate', cells }, options)
            .then((decoded) => ({ kind: 'validate', decoded }))
    }
    case 'generate':
      return client
        .run({ kind: 'generate', difficulty: task.difficulty, seed: seed() }, options)
        .then((decoded) => ({ kind: 'generate', decoded }))
  }
}

/** The reply event for a request. A wire error code, or bytes that failed to decode, is `failed`. */
export function toReply(id: number, answer: Answer): Reply {
  switch (answer.kind) {
    case 'solve':
      return answer.decoded.ok
        ? solved(id, answer.decoded.result)
        : failed(id, answer.decoded.error)
    case 'validate':
      return answer.decoded.ok
        ? validated(id, answer.decoded.result)
        : failed(id, answer.decoded.error)
    case 'generate':
      return answer.decoded.ok
        ? generated(id, answer.decoded.result)
        : failed(id, answer.decoded.error)
  }
}

/** A puzzle for the pool from the background lane, rejecting with the reason when there is none. */
export async function generatePooled(
  client: SolverClient,
  difficulty: Difficulty,
  seed: number,
): Promise<PooledPuzzle> {
  const decoded = await client.run({ kind: 'generate', difficulty, seed }, { lane: 'background' })
  if (!decoded.ok) throw new Error(decoded.error)
  const { result } = decoded
  if (result.kind === 'error') throw new Error(result.error)
  const puzzle = toPuzzle(result.puzzle, result.solution)
  if (puzzle === null) throw new Error(OUT_OF_RANGE)
  return { difficulty, ...puzzle }
}
