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
import type { Loaded, LoadedGame, Metrics } from '../codec/storage'
import type { CellIndex, Digit } from '../digits'
import type { Direction } from '../geometry'
import type { KeyCommand } from '../keymap'
import type { Difficulty, Pool, PooledPuzzle, PuzzleData } from '../pool'
import type { InputMode } from './state'
import type { SolveResult } from './steps'

/** Every storage key read back on startup, each decoded on its own. */
export interface LoadedSlices {
  readonly game: LoadedGame
  readonly metrics: Loaded<Metrics>
  readonly pool: Loaded<Pool>
}

/** Player intents. The update ignores one the state does not allow. */
export type UserEvent =
  /** A digit typed on a focused cell, which then shades that digit. */
  | { readonly type: 'digit'; readonly digit: Digit }
  /** A number pad key, which locks the digit under sticky numbers and otherwise shades it and enters it. */
  | { readonly type: 'pad'; readonly digit: Digit }
  | { readonly type: 'erase'; readonly how: 'delete' | 'backspace' }
  | { readonly type: 'move'; readonly direction: Direction }
  /** Focus reached a cell, or left the grid with null. */
  | { readonly type: 'select'; readonly index: CellIndex | null }
  /** A pointer tap on a cell, which applies the locked sticky digit. */
  | { readonly type: 'tap'; readonly index: CellIndex }
  | { readonly type: 'setMode'; readonly mode: InputMode }
  | { readonly type: 'cycleMode' }
  | { readonly type: 'toggleSticky' }
  | { readonly type: 'releaseSticky' }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }
  | { readonly type: 'clear' }
  | { readonly type: 'autoFill' }
  | { readonly type: 'hint' }
  | { readonly type: 'dismissHint' }
  | { readonly type: 'solve' }
  | { readonly type: 'newGame'; readonly difficulty: Difficulty }
  | { readonly type: 'enterCustom' }
  | { readonly type: 'validate' }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  /** Text pasted onto the grid. */
  | { readonly type: 'paste'; readonly text: string }
  | { readonly type: 'acceptOffer' }
  | { readonly type: 'declineOffer' }
  /** Copy the board as a puzzle string. */
  | { readonly type: 'export' }
  /** Copy a link to the puzzle, built on the page's own address. */
  | { readonly type: 'share'; readonly href: string }
  /** Show a walkthrough position, 0 for the board as given. */
  | { readonly type: 'viewStep'; readonly cursor: number }
  | { readonly type: 'step'; readonly delta: -1 | 1 }
  | { readonly type: 'exitWalkthrough' }

/** Reports from the runtime about storage, the page, timers and the solver. */
export type SystemEvent =
  | { readonly type: 'loaded'; readonly slices: LoadedSlices }
  /** The page's address on startup, with a shared puzzle in its query or without one. */
  | { readonly type: 'opened'; readonly search: string; readonly href: string }
  /** The page was hidden or is being left. */
  | { readonly type: 'hidden' }
  /** The clock timer fired. */
  | { readonly type: 'tick' }
  | { readonly type: 'flashEnded'; readonly pulse: number }
  | { readonly type: 'solved'; readonly id: number; readonly result: SolveResult }
  /** The unique solution of a validated board, or null when it has none or several. */
  | { readonly type: 'validated'; readonly id: number; readonly solution: Board | null }
  | { readonly type: 'generated'; readonly id: number; readonly puzzle: PuzzleData }
  | { readonly type: 'failed'; readonly id: number; readonly reason: string }
  /** A round of background generation, stored in one update. */
  | { readonly type: 'refilled'; readonly puzzles: readonly PooledPuzzle[] }

export type Event = UserEvent | SystemEvent
export type EventType = Event['type']

/** Maps a key command to its event. Keymap commands and game events share their names. */
export function fromKey(command: KeyCommand): UserEvent {
  switch (command.kind) {
    case 'digit':
      return { type: 'digit', digit: command.digit }
    case 'erase':
      return { type: 'erase', how: command.how }
    case 'move':
      return { type: 'move', direction: command.direction }
    case 'step':
      return { type: 'step', delta: command.delta }
    case 'cycleMode':
    case 'toggleSticky':
    case 'releaseSticky':
    case 'undo':
    case 'redo':
      return { type: command.kind }
  }
}
