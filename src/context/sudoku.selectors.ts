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

import type { SudokuState } from './sudoku.types'

/** The board takes player input while playing or while a custom puzzle is typed in. */
export const isEditable = (state: SudokuState): boolean =>
  state.solver.gameMode === 'playing' || state.solver.gameMode === 'customInput'

/** The generator, solver or validator is running. */
export const isBusy = (state: SudokuState): boolean =>
  state.solver.isGenerating || state.solver.isSolving || state.solver.isValidating

/** The board is being read by the solver or validator, or is hidden behind the pause screen. */
const isBoardFrozen = (state: SudokuState): boolean =>
  state.solver.isSolving || state.solver.isValidating || state.ui.isPaused

/** Cells refuse focus and input, so the number pad and erase button refuse them too. */
export const isGridReadOnly = (state: SudokuState): boolean =>
  !isEditable(state) || state.solver.isSolved || isBoardFrozen(state)

/** Undo is allowed after a win, so a solved board can be stepped back. */
export const canUndoRedo = (state: SudokuState): boolean =>
  isEditable(state) && !isBoardFrozen(state)

/** Clearing resets a won board too. Whether there is anything to clear is up to the caller. */
export const canClearBoard = (state: SudokuState): boolean =>
  isEditable(state) && !isBoardFrozen(state)

/** The game clock ticks, and pausing is possible. */
export const isClockRunning = (state: SudokuState): boolean =>
  state.solver.gameMode === 'playing' && !state.solver.isSolved && !state.ui.isPaused

/** A digit the player placed that disagrees with the known solution. */
export const isWrongValue = (state: SudokuState, index: number): boolean => {
  const { gameMode, solution } = state.solver
  const cell = state.board[index]
  return (
    gameMode === 'playing' &&
    !cell.isGiven &&
    cell.value !== null &&
    solution !== null &&
    solution[index] !== cell.value
  )
}

export const canRequestHint = (state: SudokuState): boolean =>
  isClockRunning(state) && !state.solver.isHinting && !state.solver.isSolving

export const canAutoFill = (state: SudokuState): boolean =>
  state.solver.gameMode === 'playing' &&
  !isGridReadOnly(state) &&
  !state.derived.isBoardEmpty &&
  !state.derived.isBoardFull

export const canSolve = (state: SudokuState): boolean =>
  !isBoardFrozen(state) &&
  !state.solver.isHinting &&
  !state.solver.isSolved &&
  !state.solver.solveFailed &&
  !state.derived.isBoardEmpty &&
  !state.derived.isBoardFull &&
  state.derived.conflicts.size === 0
