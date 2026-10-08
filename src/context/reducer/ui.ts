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

import type {
  OfferPuzzleAction,
  SetHighlightedValueAction,
  SetInputModeAction,
  SetTransientConflictsAction,
} from '../sudoku.actions.types'
import type { InputMode, SudokuState } from '../sudoku.types'

const INPUT_MODES: readonly InputMode[] = ['normal', 'candidate', 'center']

export const handleSetInputMode = (
  state: SudokuState,
  action: SetInputModeAction,
): SudokuState => ({
  ...state,
  ui: { ...state.ui, inputMode: action.mode },
})

export const handleCycleInputMode = (state: SudokuState): SudokuState => {
  const next = INPUT_MODES[(INPUT_MODES.indexOf(state.ui.inputMode) + 1) % INPUT_MODES.length]
  return { ...state, ui: { ...state.ui, inputMode: next } }
}

export const handleClearError = (state: SudokuState): SudokuState => ({
  ...state,
  ui: { ...state.ui, lastError: null },
})

export const handleSetHighlightedValue = (
  state: SudokuState,
  action: SetHighlightedValueAction,
): SudokuState => ({ ...state, ui: { ...state.ui, highlightedValue: action.value } })

export const handleSetTransientConflicts = (
  state: SudokuState,
  action: SetTransientConflictsAction,
): SudokuState => ({ ...state, ui: { ...state.ui, transientConflicts: action.indices } })

export const handleClearTransientConflicts = (state: SudokuState): SudokuState => ({
  ...state,
  ui: { ...state.ui, transientConflicts: null },
})

export const handleOfferPuzzle = (state: SudokuState, action: OfferPuzzleAction): SudokuState => ({
  ...state,
  ui: { ...state.ui, pendingPuzzle: action.boardString },
})

export const handleDismissPuzzle = (state: SudokuState): SudokuState => ({
  ...state,
  ui: { ...state.ui, pendingPuzzle: null },
})
