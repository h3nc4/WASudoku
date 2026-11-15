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

import { boardToString, valueAt } from '../board'
import { CELLS } from '../geometry'
import { type Outcome, stay } from './effects'
import { canRequestHint, isWrongAt } from './guards'
import { request } from './session'
import type { State } from './state'
import type { SolveResult } from './steps'

const NO_HINT: Outcome['effects'] = [{ kind: 'toast', message: 'noHint', tone: 'error' }]

/** A wrong digit spoils every later deduction, so it is pointed out first and the solver is not asked. */
export function onHint(state: State): Outcome {
  const { game } = state
  if (game.mode !== 'playing' || !canRequestHint(state)) return stay(state)
  const mistake = CELLS.find((index) => isWrongAt(game, index))
  if (mistake !== undefined) {
    return stay({ ...state, game: { ...game, hint: { kind: 'mistake', index: mistake } } })
  }
  const puzzle = boardToString(game.play.history.present)
  return request(
    { ...state, game: { ...game, hint: null } },
    { task: 'hint' },
    { kind: 'solve', puzzle },
  )
}

/** Keeps the first step, and when logic is stuck reveals the first empty cell from the solution. */
export function onHintSolved(state: State, result: SolveResult): Outcome {
  const { game } = state
  if (game.mode !== 'playing') return stay(state)
  const [step] = result.steps
  if (step !== undefined) return stay({ ...state, game: { ...game, hint: { kind: 'step', step } } })
  const board = game.play.history.present
  const solution = game.play.solution ?? result.solution
  const index = CELLS.find((cell) => valueAt(board, cell) === null)
  const digit = index === undefined ? null : valueAt(solution, index)
  if (index === undefined || digit === null) return { state, effects: NO_HINT }
  return stay({ ...state, game: { ...game, hint: { kind: 'reveal', index, digit } } })
}

export const onHintFailed = (state: State): Outcome => ({ state, effects: NO_HINT })

export function onDismissHint(state: State): Outcome {
  const { game } = state
  return stay(
    game.mode === 'playing' && game.hint !== null
      ? { ...state, game: { ...game, hint: null } }
      : state,
  )
}
