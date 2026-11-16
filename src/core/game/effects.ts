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

import type { StorageKey } from '../codec/storage'
import type { Difficulty, Pool } from '../pool'
import type { State } from './state'

/** Work for the foreground solver worker, the boards as 81-character puzzle strings. */
export type SolverTask =
  | { readonly kind: 'solve'; readonly puzzle: string }
  | { readonly kind: 'validate'; readonly puzzle: string }
  | { readonly kind: 'generate'; readonly difficulty: Difficulty }

/** Toasts by id. The UI maps each id to text in the player's locale. */
export type MessageId =
  | 'solved'
  | 'solveFailed'
  | 'generated'
  | 'generateFailed'
  | 'validated'
  | 'invalidPuzzle'
  | 'validateFailed'
  | 'noHint'
  | 'badPaste'
  | 'imported'
  | 'exported'
  | 'linkCopied'

export type Tone = 'success' | 'error'

/** Idle saves wait for the page to idle and absorb later saves of their key, while `now` writes at once. */
export type SaveTiming = 'idle' | 'now'

/** Side effects as data. The runtime performs them, and reports back through events. */
export type Effect =
  | { readonly kind: 'solver'; readonly id: number; readonly task: SolverTask }
  | { readonly kind: 'cancel'; readonly id: number }
  /** Write a key, encoding it from the state of that moment with `serialize`. */
  | { readonly kind: 'save'; readonly key: StorageKey; readonly when: SaveTiming }
  /** Write this text to a key at once, for a value the state does not hold. */
  | { readonly kind: 'write'; readonly key: StorageKey; readonly text: string }
  /** A key that failed to decode, kept as it is and reported for the log. */
  | { readonly kind: 'corrupt'; readonly key: StorageKey; readonly reason: string }
  /** Replaces the one clock timer, which sends `tick` after the delay. Null stops it. */
  | { readonly kind: 'tick'; readonly delayMs: number | null }
  | { readonly kind: 'toast'; readonly message: MessageId; readonly tone: Tone }
  | { readonly kind: 'replaceUrl'; readonly href: string }
  | { readonly kind: 'copy'; readonly text: string; readonly message: MessageId }
  /** Ends a conflict pulse with `flashEnded` after the delay. */
  | { readonly kind: 'flash'; readonly pulse: number; readonly delayMs: number }
  /** The pool changed. The background refill tops up each difficulty left short. */
  | { readonly kind: 'refill'; readonly pool: Pool }

export type EffectKind = Effect['kind']

/** The next state and the effects the runtime performs for it, in order. */
export interface Outcome {
  readonly state: State
  readonly effects: readonly Effect[]
}

export const stay = (state: State): Outcome => ({ state, effects: [] })
