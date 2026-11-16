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

import type { Board } from '../board'
import type { CellIndex, Digit } from '../digits'
import { type History, push, startHistory } from '../history'
import type { Difficulty } from '../pool'
import { isSolved } from '../rules'
import type { Effect, Outcome, SolverTask } from './effects'
import { digitAt } from './guards'
import {
  type EditableGame,
  type Game,
  historyIn,
  INITIAL_INPUT,
  newPlay,
  type Pending,
  type Play,
  type State,
} from './state'

// Transitions shared by the event handlers.

/** Matches the conflict pulse keyframes, and the static outline lasts as long. */
export const FLASH_MS = 600

/** A play is in the won mode once its board matches the solution, and in the playing mode otherwise. */
export const settlePlay = (play: Play): Game =>
  play.solution !== null && isSolved(play.history.present, play.solution)
    ? { mode: 'won', play }
    : { mode: 'playing', play, paused: false, hint: null }

/** Replaces the edited history, a step of undo or redo, or one more board. */
export function withHistory(
  state: State,
  game: EditableGame,
  history: History,
  mistake = false,
): State {
  if (game.mode === 'entering') return { ...state, game: { mode: 'entering', history } }
  const mistakes = game.play.mistakes + (mistake ? 1 : 0)
  return { ...state, game: settlePlay({ ...game.play, history, mistakes }) }
}

/** Records a board the player made, after which redo has nothing left. */
export function commit(state: State, game: EditableGame, board: Board, mistake = false): State {
  return withHistory(state, game, push(historyIn(game), board), mistake)
}

export const select = (state: State, index: CellIndex | null): State => ({
  ...state,
  input: { ...state.input, selected: index, highlight: digitAt(state.game, index) },
})

export const highlight = (state: State, digit: Digit | null): State => ({
  ...state,
  input: { ...state.input, highlight: digit },
})

export const cancelPending = (state: State): Effect[] =>
  state.pending === null ? [] : [{ kind: 'cancel', id: state.pending.id }]

/** Starts another game, dropping any request in flight. Sticky numbers stays, its lock does not. */
export const startSession = (
  state: State,
  game: Game,
  effects: readonly Effect[] = [],
): Outcome => ({
  state: {
    ...state,
    game,
    pending: null,
    input: { ...INITIAL_INPUT, sticky: state.input.sticky },
    offer: null,
    // The pulse count carries on, so a flash timer left from the last game never ends a new flash.
    flash: null,
  },
  effects: [...cancelPending(state), ...effects],
})

export const startPlay = (
  state: State,
  puzzle: Board,
  solution: Board | null,
  difficulty: Difficulty | null,
  effects: readonly Effect[] = [],
): Outcome =>
  startSession(
    state,
    settlePlay(newPlay(puzzle, startHistory(puzzle), solution, difficulty)),
    effects,
  )

type PendingTask =
  | { readonly task: 'solve' | 'hint' | 'validate' }
  | { readonly task: 'generate'; readonly difficulty: Difficulty }

/** Sends one request to the solver, cancelling whatever the player waited on before. */
export function request(state: State, pending: PendingTask, task: SolverTask): Outcome {
  const id = state.nextId
  return {
    state: { ...state, pending: { ...pending, id }, nextId: state.nextId + 1 },
    effects: [...cancelPending(state), { kind: 'solver', id, task }],
  }
}

/** The pending request a reply answers, or null for a stale or unknown reply. */
export const answered = (state: State, id: number): Pending | null =>
  state.pending?.id === id ? state.pending : null

/** Clears the answered request. */
export const settled = (state: State): State => ({ ...state, pending: null })
