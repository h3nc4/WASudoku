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

import type { SetStickyValueAction, TapCellAction } from '../sudoku.actions.types'
import { isGridReadOnly } from '../sudoku.selectors'
import type { BoardState, SudokuState, UiState } from '../sudoku.types'
import { handleEraseCell, handleInputValue, handleSetActiveCell, handleSetCellValue } from './board'
import { isLockedGiven } from './state'

const isDigitComplete = (board: BoardState, value: number): boolean =>
  board.filter((cell) => cell.value === value).length >= 9

/** Drops the lock, and the shading goes back to following the selected cell. */
const releaseLock = (state: SudokuState): UiState => {
  const { activeCellIndex } = state.ui
  return {
    ...state.ui,
    stickyValue: null,
    highlightedValue: activeCellIndex === null ? null : state.board[activeCellIndex].value,
  }
}

export const handleToggleSticky = (state: SudokuState): SudokuState => {
  if (isGridReadOnly(state)) return state
  if (state.ui.sticky) return { ...state, ui: { ...releaseLock(state), sticky: false } }
  return { ...state, ui: { ...state.ui, sticky: true } }
}

export const handleSetStickyValue = (
  state: SudokuState,
  action: SetStickyValueAction,
): SudokuState => {
  const { value } = action
  if (!state.ui.sticky || isGridReadOnly(state)) return state
  if (value === null) return { ...state, ui: releaseLock(state) }
  if (isDigitComplete(state.board, value)) return state
  return { ...state, ui: { ...state.ui, stickyValue: value, highlightedValue: value } }
}

/** A tap with a digit locked is one ordinary move, and a tap on the same digit takes it back. */
export const handleTapCell = (state: SudokuState, action: TapCellAction): SudokuState => {
  const { stickyValue: value, inputMode } = state.ui
  // Focus already selected the cell, so a tap with nothing locked doesn't change the state.
  if (value === null || isGridReadOnly(state)) return state

  const { index } = action
  const selected = handleSetActiveCell(state, { type: 'SET_ACTIVE_CELL', index })
  if (isLockedGiven(state, index)) return selected
  if (inputMode !== 'normal') return handleInputValue(selected, { type: 'INPUT_VALUE', value })
  return state.board[index].value === value
    ? handleEraseCell(selected, { type: 'ERASE_CELL', index })
    : handleSetCellValue(selected, { type: 'SET_CELL_VALUE', index, value })
}

/** Keeps the locked digit shaded, and releases it once it is complete or input stops. */
export const settleSticky = (prev: SudokuState, next: SudokuState): SudokuState => {
  const { stickyValue } = next.ui
  if (stickyValue === null) return next
  const keep =
    !isGridReadOnly(next) &&
    next.solver.gameMode === prev.solver.gameMode &&
    !isDigitComplete(next.board, stickyValue)
  if (!keep) return { ...next, ui: releaseLock(next) }
  if (next.ui.highlightedValue === stickyValue) return next
  return { ...next, ui: { ...next.ui, highlightedValue: stickyValue } }
}
