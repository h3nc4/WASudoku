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
import { type Clock, STOPPED_CLOCK } from '../clock'
import type { CellIndex, Digit } from '../digits'
import type { History } from '../history'
import { type Difficulty, EMPTY_POOL, type Pool } from '../pool'
import type { Hint, Step } from './steps'

export type InputMode = 'normal' | 'candidate' | 'center'
export const INPUT_MODES: readonly InputMode[] = ['normal', 'candidate', 'center']

/** One puzzle in play, kept whole while the walkthrough or the win screen shows it. */
export interface Play {
  /** The board the puzzle started from, its givens marked. */
  readonly puzzle: Board
  readonly history: History
  /** Null when the solution is unknown, and then mistakes are not counted and the won mode is never reached. */
  readonly solution: Board | null
  /** Null for a custom puzzle. */
  readonly difficulty: Difficulty | null
  readonly clock: Clock
  readonly mistakes: number
  /** The solver gave up on this board, so solving stays off until the board changes. */
  readonly solveFailed: boolean
}

/** The solver's steps over a play, and the position shown: 0 is the board as given, the last the solution. */
export interface Walk {
  readonly steps: readonly Step[]
  readonly cursor: number
  readonly solution: Board
}

export type Game =
  | { readonly mode: 'selecting' }
  | { readonly mode: 'entering'; readonly history: History }
  | {
      readonly mode: 'playing'
      readonly play: Play
      readonly paused: boolean
      readonly hint: Hint | null
    }
  | { readonly mode: 'won'; readonly play: Play }
  | { readonly mode: 'walkthrough'; readonly play: Play; readonly walk: Walk }

export type Mode = Game['mode']

/** The one solver request the player waits on, its id naming it so any other reply is dropped. Pool refills run apart from it. */
export type Pending =
  | { readonly id: number; readonly task: 'solve' | 'hint' | 'validate' }
  | { readonly id: number; readonly task: 'generate'; readonly difficulty: Difficulty }

export type Task = Pending['task']

export interface Input {
  readonly selected: CellIndex | null
  readonly mode: InputMode
  /** The digit shaded across the board. */
  readonly highlight: Digit | null
  /** Sticky numbers, where a pad key locks its digit and each tap applies it. A preference kept across puzzles. */
  readonly sticky: boolean
  readonly stickyDigit: Digit | null
}

/** Peers that refused a note, pulsed once. The pulse count tells one clash from the next. */
export interface Flash {
  readonly cells: readonly CellIndex[]
  readonly pulse: number
}

export interface State {
  readonly game: Game
  readonly input: Input
  readonly pending: Pending | null
  readonly pool: Pool
  /** A puzzle string from a link or a paste, waiting for the player to accept it. */
  readonly offer: string | null
  readonly flash: Flash | null
  readonly pulses: number
  readonly nextId: number
}

export const SELECTING: Game = { mode: 'selecting' }

export const INITIAL_INPUT: Input = {
  selected: null,
  mode: 'normal',
  highlight: null,
  sticky: false,
  stickyDigit: null,
}

export const INITIAL_STATE: State = {
  game: SELECTING,
  input: INITIAL_INPUT,
  pending: null,
  pool: EMPTY_POOL,
  offer: null,
  flash: null,
  pulses: 0,
  nextId: 1,
}

/** A fresh play over a puzzle. Its clock starts once the update syncs it. */
export const newPlay = (
  puzzle: Board,
  history: History,
  solution: Board | null,
  difficulty: Difficulty | null,
): Play => ({
  puzzle,
  history,
  solution,
  difficulty,
  clock: STOPPED_CLOCK,
  mistakes: 0,
  solveFailed: false,
})

/** The play behind every mode that has one. */
export function playOf(game: Game): Play | null {
  switch (game.mode) {
    case 'selecting':
    case 'entering':
      return null
    case 'playing':
    case 'won':
    case 'walkthrough':
      return game.play
  }
}

/** The history the player edits, a typed-in puzzle's or a play's. */
export const historyOf = (game: Game): History | null =>
  game.mode === 'entering' ? game.history : (playOf(game)?.history ?? null)

/** The player's board, or null on the selection screen. The walkthrough's own board is a selector. */
export const boardOf = (game: Game): Board | null => historyOf(game)?.present ?? null

/** A game whose board the player edits or steps through. */
export type EditableGame = Extract<Game, { readonly mode: 'entering' | 'playing' | 'won' }>

export const editable = (game: Game): EditableGame | null =>
  game.mode === 'entering' || game.mode === 'playing' || game.mode === 'won' ? game : null

export const historyIn = (game: EditableGame): History =>
  game.mode === 'entering' ? game.history : game.play.history

export const boardIn = (game: EditableGame): Board => historyIn(game).present
