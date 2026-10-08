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
  handleSetStickyValue,
  handleTapCell,
  handleToggleSticky,
  settleSticky,
} from './reducer/sticky'
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

function reduceAction(state: SudokuState, action: SudokuAction): SudokuState {
  switch (action.type) {
    case 'SET_CELL_VALUE':
      return handleSetCellValue(state, action)
    case 'TOGGLE_PENCIL_MARK':
      return handleTogglePencilMark(state, action)
    case 'ERASE_CELL':
      return handleEraseCell(state, action)
    case 'CLEAR_BOARD':
      return handleClearBoard(state)
    case 'IMPORT_BOARD':
      return handleImportBoard(state, action)
    case 'AUTO_FILL_CANDIDATES':
      return handleAutoFillCandidates(state)
    case 'UNDO':
      return handleUndo(state)
    case 'REDO':
      return handleRedo(state)
    case 'SOLVE_START':
      return handleSolveStart(state)
    case 'SOLVE_SUCCESS':
      return handleSolveSuccess(state, action)
    case 'SOLVE_FAILURE':
      return handleSolveFailure(state)
    case 'GENERATE_PUZZLE_START':
      return handleGeneratePuzzleStart(state, action)
    case 'GENERATE_PUZZLE_SUCCESS':
      return handleGeneratePuzzleSuccess(state, action)
    case 'GENERATE_PUZZLE_FAILURE':
      return handleGeneratePuzzleFailure(state)
    case 'REQUEST_POOL_REFILL':
      return handleRequestPoolRefill(state, action)
    case 'POOL_REFILL_SUCCESS':
      return handlePoolRefillSuccess(state, action)
    case 'POOL_REFILL_FAILURE':
      return handlePoolRefillFailure(state, action)
    case 'VALIDATE_PUZZLE_START':
      return handleValidatePuzzleStart(state)
    case 'VALIDATE_PUZZLE_SUCCESS':
      return handleValidatePuzzleSuccess(state, action)
    case 'VALIDATE_PUZZLE_FAILURE':
      return handleValidatePuzzleFailure(state, action)
    case 'START_CUSTOM_PUZZLE':
      return handleStartCustomPuzzle(state)
    case 'VIEW_SOLVER_STEP':
      return handleViewSolverStep(state, action)
    case 'EXIT_VISUALIZATION':
      return handleExitVisualization(state)
    case 'SET_ACTIVE_CELL':
      return handleSetActiveCell(state, action)
    case 'SET_INPUT_MODE':
      return handleSetInputMode(state, action)
    case 'CLEAR_ERROR':
      return handleClearError(state)
    case 'SET_HIGHLIGHTED_VALUE':
      return handleSetHighlightedValue(state, action)
    case 'TICK_TIMER':
      return handleTickTimer(state)
    case 'SET_TRANSIENT_CONFLICTS':
      return handleSetTransientConflicts(state, action)
    case 'CLEAR_TRANSIENT_CONFLICTS':
      return handleClearTransientConflicts(state)
    case 'REQUEST_HINT':
      return handleRequestHint(state)
    case 'HINT_SUCCESS':
      return handleHintSuccess(state, action)
    case 'HINT_FAILURE':
      return handleHintFailure(state)
    case 'CLEAR_HINT':
      return handleClearHint(state)
    case 'PAUSE_GAME':
      return handlePauseGame(state)
    case 'RESUME_GAME':
      return handleResumeGame(state)
    case 'OFFER_PUZZLE':
      return handleOfferPuzzle(state, action)
    case 'DISMISS_PUZZLE':
      return handleDismissPuzzle(state)
    case 'LOAD_PUZZLE':
      return handleLoadPuzzle(state, action)
    case 'INPUT_VALUE':
      return handleInputValue(state, action)
    case 'NAVIGATE':
      return handleNavigate(state, action)
    case 'ERASE_ACTIVE_CELL':
      return handleEraseActiveCell(state, action)
    case 'CYCLE_INPUT_MODE':
      return handleCycleInputMode(state)
    case 'STEP_VISUALIZATION':
      return handleStepVisualization(state, action)
    case 'TOGGLE_STICKY':
      return handleToggleSticky(state)
    case 'SET_STICKY_VALUE':
      return handleSetStickyValue(state, action)
    case 'TAP_CELL':
      return handleTapCell(state, action)
    default:
      return state
  }
}

export function sudokuReducer(state: SudokuState, action: SudokuAction): SudokuState {
  const newState = settleSticky(state, reduceAction(state, action))

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
