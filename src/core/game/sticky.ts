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

import { valueAt } from '../board'
import type { CellIndex, Digit } from '../digits'
import { isDigitComplete } from '../rules'
import { type Outcome, stay } from './effects'
import { digitAt, isGridReadOnly, isLockedGiven } from './guards'
import { eraseAt, inputDigit, inputGame, placeDigit } from './playing'
import { select } from './session'
import { boardIn, type Input, type State } from './state'

/** Drops the lock, and the shading goes back to following the selected cell. */
const release = (state: State): Input => ({
  ...state.input,
  stickyDigit: null,
  highlight: digitAt(state.game, state.input.selected),
})

export function onToggleSticky(state: State): Outcome {
  if (isGridReadOnly(state)) return stay(state)
  const { input } = state
  if (input.sticky) return stay({ ...state, input: { ...release(state), sticky: false } })
  return stay({ ...state, input: { ...input, sticky: true } })
}

/** Locks a digit for cell taps, or releases the lock with null. The pad already refused a complete digit. */
export function lockSticky(state: State, digit: Digit | null): Outcome {
  const game = inputGame(state)
  if (!state.input.sticky || game === null) return stay(state)
  if (digit === null) return stay({ ...state, input: release(state) })
  return stay({ ...state, input: { ...state.input, stickyDigit: digit, highlight: digit } })
}

/** A tap with a digit locked is one ordinary move, and a tap on the same digit takes it back. */
export function onTap(state: State, index: CellIndex): Outcome {
  const digit = state.input.stickyDigit
  const game = inputGame(state)
  // Focus already selected the cell. A tap with nothing locked doesn't change the state.
  if (digit === null || game === null) return stay(state)
  const selected = select(state, index)
  if (isLockedGiven(game, index)) return stay(selected)
  if (state.input.mode !== 'normal') return inputDigit(selected, game, digit)
  return stay(
    valueAt(boardIn(game), index) === digit
      ? eraseAt(selected, game, index)
      : placeDigit(selected, game, index, digit),
  )
}

/** Keeps the locked digit shaded, and releases it once it is complete, input stops or the mode changes. */
export function settleSticky(prev: State, next: State): State {
  const digit = next.input.stickyDigit
  if (digit === null) return next
  const game = inputGame(next)
  const keep =
    game !== null && prev.game.mode === next.game.mode && !isDigitComplete(boardIn(game), digit)
  if (!keep) return { ...next, input: release(next) }
  if (next.input.highlight === digit) return next
  return { ...next, input: { ...next.input, highlight: digit } }
}
