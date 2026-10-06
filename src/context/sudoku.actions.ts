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
  AutoFillCandidatesAction,
  ClearBoardAction,
  ClearErrorAction,
  ClearHintAction,
  ClearTransientConflictsAction,
  CycleInputModeAction,
  DismissPuzzleAction,
  EraseActiveCellAction,
  EraseCellAction,
  ExitVisualizationAction,
  GeneratePuzzleFailureAction,
  GeneratePuzzleStartAction,
  GeneratePuzzleSuccessAction,
  HintFailureAction,
  HintSuccessAction,
  ImportBoardAction,
  InputValueAction,
  LoadPuzzleAction,
  NavigateAction,
  OfferPuzzleAction,
  PauseGameAction,
  PoolRefillFailureAction,
  PoolRefillSuccessAction,
  RedoAction,
  RequestHintAction,
  RequestPoolRefillAction,
  ResumeGameAction,
  SetActiveCellAction,
  SetCellValueAction,
  SetHighlightedValueAction,
  SetInputModeAction,
  SetTransientConflictsAction,
  SolveFailureAction,
  SolveStartAction,
  SolveSuccessAction,
  StartCustomPuzzleAction,
  StepVisualizationAction,
  TickTimerAction,
  TogglePencilMarkAction,
  UndoAction,
  ValidatePuzzleFailureAction,
  ValidatePuzzleStartAction,
  ValidatePuzzleSuccessAction,
  ViewSolverStepAction,
} from './sudoku.actions.types'
import type { InputMode, SolveResult } from './sudoku.types'

/** Creates an action to set the definitive value of a cell. */
export const setCellValue = (index: number, value: number): SetCellValueAction => ({
  type: 'SET_CELL_VALUE',
  index,
  value,
})

/** Creates an action to toggle a pencil mark in a cell. */
export const togglePencilMark = (
  index: number,
  value: number,
  mode: 'candidate' | 'center',
): TogglePencilMarkAction => ({
  type: 'TOGGLE_PENCIL_MARK',
  index,
  value,
  mode,
})

/** Creates an action to erase the contents of a cell. */
export const eraseCell = (index: number): EraseCellAction => ({
  type: 'ERASE_CELL',
  index,
})

/** Creates an action to clear the entire board. */
export const clearBoard = (): ClearBoardAction => ({
  type: 'CLEAR_BOARD',
})

/** Creates an action to replace the current board with an imported one. */
export const importBoard = (boardString: string): ImportBoardAction => ({
  type: 'IMPORT_BOARD',
  boardString,
})

/** Creates an action to automatically fill candidates for all empty cells. */
export const autoFillCandidates = (): AutoFillCandidatesAction => ({
  type: 'AUTO_FILL_CANDIDATES',
})

/** Creates an action to undo the last move. */
export const undo = (): UndoAction => ({
  type: 'UNDO',
})

/** Creates an action to redo the last undone move. */
export const redo = (): RedoAction => ({
  type: 'REDO',
})

/** Creates an action to signal the start of the solving process. */
export const solveStart = (): SolveStartAction => ({
  type: 'SOLVE_START',
})

/** Creates an action to signal a successful solve. */
export const solveSuccess = (result: SolveResult): SolveSuccessAction => ({
  type: 'SOLVE_SUCCESS',
  result,
})

/** Creates an action to signal a failed solve attempt. */
export const solveFailure = (): SolveFailureAction => ({
  type: 'SOLVE_FAILURE',
})

/** Creates an action to signal the start of the puzzle generation process. */
export const generatePuzzleStart = (difficulty: string): GeneratePuzzleStartAction => ({
  type: 'GENERATE_PUZZLE_START',
  difficulty,
})

/** Creates an action for when the generator successfully creates a puzzle. */
export const generatePuzzleSuccess = (
  puzzleString: string,
  solutionString: string,
): GeneratePuzzleSuccessAction => ({
  type: 'GENERATE_PUZZLE_SUCCESS',
  puzzleString,
  solutionString,
})

/** Creates an action for when the puzzle generator fails. */
export const generatePuzzleFailure = (): GeneratePuzzleFailureAction => ({
  type: 'GENERATE_PUZZLE_FAILURE',
})

/** Creates an action to note that a pool refill request has been sent to the worker. */
export const requestPoolRefill = (difficulty: string): RequestPoolRefillAction => ({
  type: 'REQUEST_POOL_REFILL',
  difficulty,
})

/** Creates an action to add a background-generated puzzle to the pool. */
export const poolRefillSuccess = (
  difficulty: string,
  puzzleString: string,
  solutionString: string,
): PoolRefillSuccessAction => ({
  type: 'POOL_REFILL_SUCCESS',
  difficulty,
  puzzleString,
  solutionString,
})

/** Creates an action to decrement the pending count if a background refill fails. */
export const poolRefillFailure = (difficulty: string): PoolRefillFailureAction => ({
  type: 'POOL_REFILL_FAILURE',
  difficulty,
})

/** Creates an action to signal the start of custom puzzle validation. */
export const validatePuzzleStart = (): ValidatePuzzleStartAction => ({
  type: 'VALIDATE_PUZZLE_START',
})

/** Creates an action for when a custom puzzle is successfully validated. */
export const validatePuzzleSuccess = (solutionString: string): ValidatePuzzleSuccessAction => ({
  type: 'VALIDATE_PUZZLE_SUCCESS',
  solutionString,
})

/** Creates an action for when a custom puzzle fails validation. */
export const validatePuzzleFailure = (error: string): ValidatePuzzleFailureAction => ({
  type: 'VALIDATE_PUZZLE_FAILURE',
  error,
})

/** Creates an action to enter the custom puzzle creation mode. */
export const startCustomPuzzle = (): StartCustomPuzzleAction => ({
  type: 'START_CUSTOM_PUZZLE',
})

/** Creates an action to set the active cell. */
export const setActiveCell = (index: number | null): SetActiveCellAction => ({
  type: 'SET_ACTIVE_CELL',
  index,
})

/** Creates an action to change the input mode. */
export const setInputMode = (mode: InputMode): SetInputModeAction => ({
  type: 'SET_INPUT_MODE',
  mode,
})

/** Creates an action to clear the last error message. */
export const clearError = (): ClearErrorAction => ({
  type: 'CLEAR_ERROR',
})

/** Creates an action to set the highlighted number value. */
export const setHighlightedValue = (value: number | null): SetHighlightedValueAction => ({
  type: 'SET_HIGHLIGHTED_VALUE',
  value,
})

/** Creates an action to view a specific step from the solver. */
export const viewSolverStep = (index: number): ViewSolverStepAction => ({
  type: 'VIEW_SOLVER_STEP',
  index,
})

/** Creates an action to exit visualization mode and return to playing. */
export const exitVisualization = (): ExitVisualizationAction => ({
  type: 'EXIT_VISUALIZATION',
})

/** Creates an action to advance the game timer by one second. */
export const tickTimer = (): TickTimerAction => ({
  type: 'TICK_TIMER',
})

/** Creates an action to set the indices that are momentarily conflicting. */
export const setTransientConflicts = (indices: Set<number>): SetTransientConflictsAction => ({
  type: 'SET_TRANSIENT_CONFLICTS',
  indices,
})

/** Creates an action to clear any transient conflict highlights. */
export const clearTransientConflicts = (): ClearTransientConflictsAction => ({
  type: 'CLEAR_TRANSIENT_CONFLICTS',
})

/** Creates an action to look for the next move on the current board. */
export const requestHint = (): RequestHintAction => ({
  type: 'REQUEST_HINT',
})

/** Creates an action with the solver result for a hint. */
export const hintSuccess = (result: SolveResult): HintSuccessAction => ({
  type: 'HINT_SUCCESS',
  result,
})

/** Creates an action for when no hint could be produced. */
export const hintFailure = (): HintFailureAction => ({
  type: 'HINT_FAILURE',
})

/** Creates an action to dismiss the current hint. */
export const clearHint = (): ClearHintAction => ({
  type: 'CLEAR_HINT',
})

/** Creates an action to pause the game. */
export const pauseGame = (): PauseGameAction => ({
  type: 'PAUSE_GAME',
})

/** Creates an action to resume a paused game. */
export const resumeGame = (): ResumeGameAction => ({
  type: 'RESUME_GAME',
})

/** Creates an action offering a puzzle to the player. */
export const offerPuzzle = (boardString: string): OfferPuzzleAction => ({
  type: 'OFFER_PUZZLE',
  boardString,
})

/** Creates an action to decline the offered puzzle. */
export const dismissPuzzle = (): DismissPuzzleAction => ({
  type: 'DISMISS_PUZZLE',
})

/** Creates an action to validate and start a puzzle from a string. */
export const loadPuzzle = (boardString: string): LoadPuzzleAction => ({
  type: 'LOAD_PUZZLE',
  boardString,
})

/** Creates an action to input a value into the active cell. */
export const inputValue = (value: number): InputValueAction => ({
  type: 'INPUT_VALUE',
  value,
})

/** Creates an action to move the active cell one step in a direction. */
export const navigate = (direction: NavigateAction['direction']): NavigateAction => ({
  type: 'NAVIGATE',
  direction,
})

/** Creates an action to erase the active cell. */
export const eraseActiveCell = (mode: EraseActiveCellAction['mode']): EraseActiveCellAction => ({
  type: 'ERASE_ACTIVE_CELL',
  mode,
})

/** Creates an action to switch to the next input mode. */
export const cycleInputMode = (): CycleInputModeAction => ({
  type: 'CYCLE_INPUT_MODE',
})

/** Creates an action to move the solver visualization one step back or forward. */
export const stepVisualization = (delta: -1 | 1): StepVisualizationAction => ({
  type: 'STEP_VISUALIZATION',
  delta,
})
