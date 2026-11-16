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

import { type Board, boardToString, isBoardFull, place, valueAt } from '../board'
import { EMPTY_MASK, withoutDigit } from '../digits'
import { CELLS, lookup } from '../geometry'
import { candidateMasks } from '../rules'
import { type Outcome, stay } from './effects'
import { canSolve } from './guards'
import { request } from './session'
import type { State, Walk } from './state'
import { BACKTRACKING_STEP, type SolveResult, type Step } from './steps'

export function onSolve(state: State): Outcome {
  const { game } = state
  if (game.mode !== 'playing' || !canSolve(state)) return stay(state)
  const puzzle = boardToString(game.play.history.present)
  return request(
    { ...state, game: { ...game, hint: null } },
    { task: 'solve' },
    { kind: 'solve', puzzle },
  )
}

/** The board with the placements of the first `upTo` steps written in. Its notes mean nothing here. */
function placedUpTo(board: Board, steps: readonly Step[], upTo: number): Board {
  let next = board
  for (const step of steps.slice(0, upTo)) {
    for (const { index, digit } of step.placements) next = place(next, index, digit)
  }
  return next
}

/** Opens the walkthrough on the solution, with a backtracking step where logic left cells open. */
export function onSolved(state: State, result: SolveResult): Outcome {
  const { game } = state
  if (game.mode !== 'playing') return stay(state)
  const { steps, solution } = result
  const board = game.play.history.present
  const all = isBoardFull(placedUpTo(board, steps, steps.length))
    ? steps
    : [...steps, BACKTRACKING_STEP]
  const walk: Walk = { steps: all, cursor: all.length, solution }
  return {
    state: { ...state, game: { mode: 'walkthrough', play: game.play, walk } },
    effects: [{ kind: 'toast', message: 'solved', tone: 'success' }],
  }
}

export function onSolveFailed(state: State): Outcome {
  const { game } = state
  const effects: Outcome['effects'] = [{ kind: 'toast', message: 'solveFailed', tone: 'error' }]
  if (game.mode !== 'playing') return { state, effects }
  const play = { ...game.play, solveFailed: true }
  return { state: { ...state, game: { ...game, play } }, effects }
}

/** Shows a walkthrough position, from 0 for the board as given to the solution. */
export function onViewStep(state: State, cursor: number): Outcome {
  const { game } = state
  if (game.mode !== 'walkthrough') return stay(state)
  const { walk } = game
  if (
    !Number.isInteger(cursor) ||
    cursor < 0 ||
    cursor > walk.steps.length ||
    cursor === walk.cursor
  ) {
    return stay(state)
  }
  return stay({ ...state, game: { ...game, walk: { ...walk, cursor } } })
}

export function onStep(state: State, delta: -1 | 1): Outcome {
  const { game } = state
  return game.mode === 'walkthrough' ? onViewStep(state, game.walk.cursor + delta) : stay(state)
}

/** Back to the game, which keeps the solver's solution as its own. */
export function onExitWalkthrough(state: State): Outcome {
  const { game } = state
  if (game.mode !== 'walkthrough') return stay(state)
  const play = { ...game.play, solution: game.walk.solution }
  return stay({
    ...state,
    game: { mode: 'playing', play, paused: false, hint: null },
    input: { ...state.input, highlight: null },
    flash: null,
  })
}

/** The step the cursor shows, or null at the board as given. */
export const currentStep = (walk: Walk): Step | null => walk.steps[walk.cursor - 1] ?? null

/** Returns the board with each step's placements up to a position, or the solution at the end. */
export function walkBoard(board: Board, walk: Walk): Board {
  if (walk.cursor < walk.steps.length) return placedUpTo(board, walk.steps, walk.cursor)
  return CELLS.reduce((next, index) => {
    const digit = valueAt(walk.solution, index)
    return digit === null || valueAt(next, index) === digit ? next : place(next, index, digit)
  }, board)
}

/** Candidates before the current step: those of the board then, less every elimination made so far. */
export function walkCandidates(board: Board, walk: Walk): number[] {
  const before = Math.max(0, walk.cursor - 1)
  const masks = candidateMasks(placedUpTo(board, walk.steps, before))
  for (const step of walk.steps.slice(0, before)) {
    for (const { index, digit } of step.eliminations) {
      masks[index] = withoutDigit(lookup(masks, index, EMPTY_MASK), digit)
    }
  }
  return masks
}
