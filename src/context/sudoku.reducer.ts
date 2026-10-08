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

import {
  handleAutoFillCandidates,
  handleClearBoard,
  handleEraseActiveCell,
  handleEraseCell,
  handleInputValue,
  handleNavigate,
  handleRedo,
  handleSetActiveCell,
  handleSetCellValue,
  handleTogglePencilMark,
  handleUndo,
} from './reducer/board'
import {
  handleClearHint,
  handleHintFailure,
  handleHintSuccess,
  handleRequestHint,
} from './reducer/hint'
import {
  handleGeneratePuzzleFailure,
  handleGeneratePuzzleStart,
  handleGeneratePuzzleSuccess,
  handleImportBoard,
  handleLoadPuzzle,
  handlePauseGame,
  handlePoolRefillFailure,
  handlePoolRefillSuccess,
  handleRequestPoolRefill,
  handleResumeGame,
  handleStartCustomPuzzle,
  handleTickTimer,
  handleValidatePuzzleFailure,
  handleValidatePuzzleStart,
  handleValidatePuzzleSuccess,
} from './reducer/lifecycle'
import { getDerivedBoardState } from './reducer/state'
import {
  handleClearError,
  handleClearTransientConflicts,
  handleCycleInputMode,
  handleDismissPuzzle,
  handleOfferPuzzle,
  handleSetHighlightedValue,
  handleSetInputMode,
  handleSetTransientConflicts,
} from './reducer/ui'
import {
  handleExitVisualization,
  handleSolveFailure,
  handleSolveStart,
  handleSolveSuccess,
  handleStepVisualization,
  handleViewSolverStep,
} from './reducer/visualization'
import type { SudokuAction } from './sudoku.actions.types'
import type { SudokuState } from './sudoku.types'

export { loadInitialState } from './reducer/lifecycle'
export { createEmptyBoard, initialState } from './reducer/state'

type ActionOf<T extends SudokuAction['type']> = Extract<SudokuAction, { type: T }>
type ActionHandlers = {
  [T in SudokuAction['type']]: (state: SudokuState, action: ActionOf<T>) => SudokuState
}

const handlers: ActionHandlers = {
  SET_CELL_VALUE: handleSetCellValue,
  TOGGLE_PENCIL_MARK: handleTogglePencilMark,
  ERASE_CELL: handleEraseCell,
  CLEAR_BOARD: handleClearBoard,
  IMPORT_BOARD: handleImportBoard,
  AUTO_FILL_CANDIDATES: handleAutoFillCandidates,
  UNDO: handleUndo,
  REDO: handleRedo,
  SOLVE_START: handleSolveStart,
  SOLVE_SUCCESS: handleSolveSuccess,
  SOLVE_FAILURE: handleSolveFailure,
  GENERATE_PUZZLE_START: handleGeneratePuzzleStart,
  GENERATE_PUZZLE_SUCCESS: handleGeneratePuzzleSuccess,
  GENERATE_PUZZLE_FAILURE: handleGeneratePuzzleFailure,
  REQUEST_POOL_REFILL: handleRequestPoolRefill,
  POOL_REFILL_SUCCESS: handlePoolRefillSuccess,
  POOL_REFILL_FAILURE: handlePoolRefillFailure,
  VALIDATE_PUZZLE_START: handleValidatePuzzleStart,
  VALIDATE_PUZZLE_SUCCESS: handleValidatePuzzleSuccess,
  VALIDATE_PUZZLE_FAILURE: handleValidatePuzzleFailure,
  START_CUSTOM_PUZZLE: handleStartCustomPuzzle,
  VIEW_SOLVER_STEP: handleViewSolverStep,
  EXIT_VISUALIZATION: handleExitVisualization,
  SET_ACTIVE_CELL: handleSetActiveCell,
  SET_INPUT_MODE: handleSetInputMode,
  CLEAR_ERROR: handleClearError,
  SET_HIGHLIGHTED_VALUE: handleSetHighlightedValue,
  TICK_TIMER: handleTickTimer,
  SET_TRANSIENT_CONFLICTS: handleSetTransientConflicts,
  CLEAR_TRANSIENT_CONFLICTS: handleClearTransientConflicts,
  REQUEST_HINT: handleRequestHint,
  HINT_SUCCESS: handleHintSuccess,
  HINT_FAILURE: handleHintFailure,
  CLEAR_HINT: handleClearHint,
  PAUSE_GAME: handlePauseGame,
  RESUME_GAME: handleResumeGame,
  OFFER_PUZZLE: handleOfferPuzzle,
  DISMISS_PUZZLE: handleDismissPuzzle,
  LOAD_PUZZLE: handleLoadPuzzle,
  INPUT_VALUE: handleInputValue,
  NAVIGATE: handleNavigate,
  ERASE_ACTIVE_CELL: handleEraseActiveCell,
  CYCLE_INPUT_MODE: handleCycleInputMode,
  STEP_VISUALIZATION: handleStepVisualization,
}

function reduceAction(state: SudokuState, action: SudokuAction): SudokuState {
  if (!Object.hasOwn(handlers, action.type)) return state
  // TypeScript cannot correlate the key with its action type, so widen the handler for the call.
  const handler = handlers[action.type] as (state: SudokuState, action: SudokuAction) => SudokuState
  return handler(state, action)
}

export function sudokuReducer(state: SudokuState, action: SudokuAction): SudokuState {
  const newState = reduceAction(state, action)

  if (newState.board !== state.board) {
    // A hint describes the board it was computed for. Any edit clears it.
    return {
      ...newState,
      derived: getDerivedBoardState(newState.board),
      solver: newState.solver.isHinting
        ? { ...newState.solver, isHinting: false }
        : newState.solver,
      ui: newState.ui.hint ? { ...newState.ui, hint: null } : newState.ui,
    }
  }

  return newState
}
