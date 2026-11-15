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

import { isBoardEmpty, isBoardFull, isGiven, valueAt } from '../board'
import type { CellIndex } from '../digits'
import { conflicts, isWrong } from '../rules'
import { boardOf, type EditableGame, type Game, type State } from './state'

// The predicates the update and the selectors share, after the old app's intent-named selectors.

/** The board takes player input or is stepped through by undo, as in play, after a win or while typing in. */
export const isEditable = ({ game }: State): boolean =>
  game.mode === 'playing' || game.mode === 'won' || game.mode === 'entering'

/** The solver is reading the board, or the pause screen hides it. */
export const isFrozen = ({ game, pending }: State): boolean =>
  pending?.task === 'solve' ||
  pending?.task === 'validate' ||
  (game.mode === 'playing' && game.paused)

/** Cells refuse focus and input, so the number pad, erase and sticky numbers refuse them too. */
export const isGridReadOnly = (state: State): boolean =>
  !(state.game.mode === 'playing' || state.game.mode === 'entering') || isFrozen(state)

/** Undo, redo and clear also work after a win, so a solved board can be stepped back. */
export const canUndoRedo = (state: State): boolean => isEditable(state) && !isFrozen(state)

export const isClockRunning = ({ game }: State): boolean => game.mode === 'playing' && !game.paused

/** Generating, solving and validating hold the new puzzle and solve buttons. A hint does not. */
export const isBusy = ({ pending }: State): boolean => pending !== null && pending.task !== 'hint'

/** Clues are fixed in play, and only editable while a puzzle is typed in. */
export const isLockedGiven = (game: EditableGame, index: CellIndex): boolean =>
  game.mode !== 'entering' && isGiven(game.play.history.present, index)

/** A digit the player placed that disagrees with the known solution, during play or after a win. */
export function isWrongAt(game: Game, index: CellIndex): boolean {
  if (game.mode !== 'playing' && game.mode !== 'won') return false
  const { history, solution } = game.play
  return solution !== null && isWrong(history.present, solution, index)
}

export const canRequestHint = (state: State): boolean =>
  isClockRunning(state) && state.pending === null

export function canAutoFill(state: State): boolean {
  const board = boardOf(state.game)
  return (
    state.game.mode === 'playing' &&
    board !== null &&
    !isGridReadOnly(state) &&
    !isBoardEmpty(board) &&
    !isBoardFull(board)
  )
}

/** Why the solve button refuses, the first reason first, or null when it may run. */
export type SolveBlock = 'conflicts' | 'full' | 'empty' | 'failed'

export function solveBlock(state: State): SolveBlock | null {
  const { game } = state
  if (game.mode !== 'playing') return null
  const board = game.play.history.present
  if (conflicts(board).size > 0) return 'conflicts'
  if (isBoardFull(board)) return 'full'
  if (isBoardEmpty(board)) return 'empty'
  return game.play.solveFailed ? 'failed' : null
}

export const canSolve = (state: State): boolean =>
  state.game.mode === 'playing' &&
  !isFrozen(state) &&
  state.pending === null &&
  solveBlock(state) === null

export function canValidate(state: State): boolean {
  const { game } = state
  return game.mode === 'entering' && state.pending === null && !isBoardEmpty(game.history.present)
}

/** The player's digit at a cell, for the shading that follows the selection. */
export function digitAt(game: Game, index: CellIndex | null) {
  const board = boardOf(game)
  return board === null || index === null ? null : valueAt(board, index)
}
