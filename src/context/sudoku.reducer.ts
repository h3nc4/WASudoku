/*
 * Copyright (C) 2025  Henrique Almeida
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
  SudokuAction,
  SetCellValueAction,
  TogglePencilMarkAction,
  EraseCellAction,
  SolveSuccessAction,
  ViewSolverStepAction,
  SetActiveCellAction,
  ImportBoardAction,
  GeneratePuzzleSuccessAction,
  GeneratePuzzleStartAction,
  ValidatePuzzleFailureAction,
  ValidatePuzzleSuccessAction,
  RequestPoolRefillAction,
  PoolRefillSuccessAction,
} from './sudoku.actions.types'
import type {
  BoardState,
  SudokuState,
  HistoryState,
  SolvingStep,
  PuzzleData,
  PersistedGameState,
  PersistedMetrics,
  PersistedPool,
} from './sudoku.types'
import {
  getRelatedCellIndices,
  validateBoard,
  calculateCandidates,
  boardStateFromString,
  areBoardsEqual,
  isMoveValid,
} from '@/lib/utils'

const BOARD_SIZE = 81
const MAX_HISTORY_ENTRIES = 100

export const STORAGE_KEYS = {
  GAME: 'wasudoku.state.game',
  METRICS: 'wasudoku.state.metrics',
  POOL: 'wasudoku.state.pool',
}

export const createEmptyBoard = (): BoardState =>
  Array(BOARD_SIZE)
    .fill(null)
    .map(() => ({
      value: null,
      isGiven: false,
      candidates: new Set<number>(),
      centers: new Set<number>(),
    }))

function getDerivedBoardState(board: BoardState) {
  const conflicts = validateBoard(board)
  const hasValues = board.some((cell) => cell.value !== null)
  const isBoardFull = board.every((cell) => cell.value !== null)

  return {
    conflicts,
    isBoardEmpty: !hasValues,
    isBoardFull,
  }
}

export const initialState: SudokuState = {
  board: createEmptyBoard(),
  initialBoard: createEmptyBoard(),
  history: {
    stack: [createEmptyBoard()],
    index: 0,
  },
  ui: {
    activeCellIndex: null,
    highlightedValue: null,
    inputMode: 'normal',
    lastError: null,
  },
  solver: {
    isSolving: false,
    isGenerating: false,
    isValidating: false,
    generationDifficulty: null,
    isSolved: false,
    solveFailed: false,
    gameMode: 'selecting',
    steps: [],
    currentStepIndex: null,
    visualizationBoard: null,
    candidatesForViz: null,
    eliminationsForViz: null,
    solution: null,
  },
  derived: getDerivedBoardState(createEmptyBoard()),
  game: {
    timer: 0,
    mistakes: 0,
  },
  puzzlePool: {
    easy: [],
    medium: [],
    hard: [],
    extreme: [],
  },
  poolRequestCount: {
    easy: 0,
    medium: 0,
    hard: 0,
    extreme: 0,
  },
}

/**
 * Custom JSON reviver to handle deserializing `Set` objects.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reviver(_key: string, value: any) {
  if (
    typeof value === 'object' &&
    value !== null &&
    value.__dataType === 'Set' &&
    Array.isArray(value.value)
  ) {
    return new Set(value.value)
  }
  return value
}

/**
 * Helper to safely load and parse an item from local storage.
 * @param key The local storage key.
 * @param reviverFn Optional JSON reviver function.
 */
function loadFromStorage<T>(
  key: string,
  reviverFn?: (this: unknown, key: string, value: unknown) => unknown,
): T | null {
  const item = window.localStorage.getItem(key)
  return item ? (JSON.parse(item, reviverFn) as T) : null
}

/**
 * Resolves the game state (board, history, mode) from persisted data.
 * Validates the history stack to ensure it's safe to use.
 */
function resolveGameState(game: PersistedGameState | null) {
  const stack = game?.history?.stack
  const index = game?.history?.index
  // Ensure stack is valid and index points to an existing board
  const hasValidHistory =
    Array.isArray(stack) && stack.length > 0 && typeof index === 'number' && stack[index]

  if (hasValidHistory && game) {
    return {
      board: stack[index],
      initialBoard: game.initialBoard ?? createEmptyBoard(),
      history: game.history,
      gameMode: 'playing' as const,
      solution: game.solution ?? null,
    }
  }

  return {
    board: createEmptyBoard(),
    initialBoard: createEmptyBoard(),
    history: initialState.history,
    gameMode: 'selecting' as const,
    solution: null,
  }
}

export function loadInitialState(): SudokuState {
  try {
    const game = loadFromStorage<PersistedGameState>(STORAGE_KEYS.GAME, reviver)
    const metrics = loadFromStorage<PersistedMetrics>(STORAGE_KEYS.METRICS)
    const pool = loadFromStorage<PersistedPool>(STORAGE_KEYS.POOL)

    if (!game && !metrics && !pool) {
      return initialState
    }

    const { board, initialBoard, history, gameMode, solution } = resolveGameState(game)

    return {
      ...initialState,
      board,
      initialBoard,
      history,
      solver: {
        ...initialState.solver,
        gameMode,
        solution,
      },
      derived: getDerivedBoardState(board),
      game: metrics ?? initialState.game,
      puzzlePool: pool?.puzzlePool ?? initialState.puzzlePool,
      poolRequestCount: pool?.poolRequestCount ?? initialState.poolRequestCount,
    }
  } catch (error) {
    console.error('Failed to load game state from local storage:', error)
    return initialState
  }
}

function updateHistory(historyState: HistoryState, newBoard: BoardState): HistoryState {
  let newStack = historyState.stack.slice(0, historyState.index + 1)
  newStack.push(newBoard)

  if (newStack.length > MAX_HISTORY_ENTRIES) {
    newStack = newStack.slice(newStack.length - MAX_HISTORY_ENTRIES)
  }

  return {
    stack: newStack,
    index: newStack.length - 1,
  }
}

const handleSetCellValue = (state: SudokuState, action: SetCellValueAction): SudokuState => {
  const { index, value } = action
  if (
    state.board[index].value === value ||
    (state.solver.gameMode === 'playing' && state.board[index].isGiven)
  ) {
    return state
  }

  const newBoard = state.board.map((cell) => ({
    ...cell,
    candidates: new Set(cell.candidates),
    centers: new Set(cell.centers),
  }))

  newBoard[index] = {
    ...newBoard[index],
    value: value,
    candidates: new Set<number>(),
    centers: new Set<number>(),
  }

  getRelatedCellIndices(index).forEach((relatedIndex) => {
    newBoard[relatedIndex].candidates.delete(value)
    newBoard[relatedIndex].centers.delete(value)
  })

  // Track mistakes if solution is known
  let mistakes = state.game.mistakes
  let isSolved = false

  if (state.solver.gameMode === 'playing' && state.solver.solution) {
    if (state.solver.solution[index] !== value) {
      mistakes += 1
    } else if (newBoard.every((cell, i) => cell.value === state.solver.solution![i])) {
      isSolved = true
    }
  }

  return {
    ...state,
    board: newBoard,
    history: updateHistory(state.history, newBoard),
    solver: { ...state.solver, isSolved, solveFailed: false },
    game: { ...state.game, mistakes },
  }
}

const handleTogglePencilMark = (
  state: SudokuState,
  action: TogglePencilMarkAction,
): SudokuState => {
  if (
    state.board[action.index].value !== null ||
    (state.solver.gameMode === 'playing' && state.board[action.index].isGiven)
  ) {
    return state
  }

  const newBoard = state.board.map((c) => ({
    ...c,
    candidates: new Set(c.candidates),
    centers: new Set(c.centers),
  }))
  const targetCell = newBoard[action.index]

  if (action.mode === 'candidate') {
    if (targetCell.candidates.has(action.value)) {
      targetCell.candidates.delete(action.value)
    } else if (isMoveValid(state.board, action.index, action.value)) {
      targetCell.candidates.add(action.value)
    } else {
      return state // Do not add conflicting candidate
    }
  } else {
    // Center mode
    targetCell.candidates.clear()
    if (targetCell.centers.has(action.value)) {
      targetCell.centers.delete(action.value)
    } else if (isMoveValid(state.board, action.index, action.value)) {
      targetCell.centers.add(action.value)
    } else {
      return state // Do not add conflicting center mark
    }
  }

  return {
    ...state,
    board: newBoard,
    history: updateHistory(state.history, newBoard),
    solver: { ...state.solver, solveFailed: false },
  }
}

const handleEraseCell = (state: SudokuState, action: EraseCellAction): SudokuState => {
  const { index } = action
  const cell = state.board[index]
  if (
    (cell.value === null && cell.candidates.size === 0 && cell.centers.size === 0) ||
    (state.solver.gameMode === 'playing' && cell.isGiven)
  ) {
    return state
  }

  const newBoard = state.board.map((cell, i) =>
    i === index
      ? { ...cell, value: null, candidates: new Set<number>(), centers: new Set<number>() }
      : {
          ...cell,
          candidates: new Set(cell.candidates),
          centers: new Set(cell.centers),
        },
  )

  return {
    ...state,
    board: newBoard,
    history: updateHistory(state.history, newBoard),
    solver: { ...state.solver, isSolved: false, solveFailed: false },
  }
}

const handleClearBoard = (state: SudokuState): SudokuState => {
  if (state.solver.gameMode === 'playing') {
    // Revert to initial puzzle, clearing user progress.
    if (areBoardsEqual(state.board, state.initialBoard)) {
      return state
    }
    const newBoard = state.initialBoard
    return {
      ...state,
      board: newBoard,
      history: {
        stack: [newBoard],
        index: 0,
      },
      solver: { ...state.solver, isSolved: false, solveFailed: false },
      ui: { ...state.ui, activeCellIndex: null, highlightedValue: null },
      game: { timer: 0, mistakes: 0 },
    }
  }

  if (state.solver.gameMode === 'customInput') {
    // Reset to a completely empty board to start custom input over.
    if (state.derived.isBoardEmpty) {
      return state
    }
    const newBoard = createEmptyBoard()
    return {
      ...state,
      board: newBoard,
      history: {
        stack: [newBoard],
        index: 0,
      },
      // Clear solution as well since we are resetting
      solver: { ...state.solver, solution: null },
      ui: { ...state.ui, activeCellIndex: null, highlightedValue: null },
      game: { timer: 0, mistakes: 0 },
    }
  }

  // The button should be disabled in other modes, but if this action is
  // dispatched somehow, this is a safe fallback.
  return state
}

const handleImportBoard = (state: SudokuState, action: ImportBoardAction): SudokuState => {
  const newBoard = boardStateFromString(action.boardString)
  const gameMode = state.solver.gameMode === 'customInput' ? 'customInput' : 'playing'

  return {
    ...initialState,
    board: newBoard,
    initialBoard: gameMode === 'playing' ? newBoard : initialState.initialBoard,
    history: {
      stack: [newBoard],
      index: 0,
    },
    solver: {
      ...initialState.solver,
      gameMode,
      // If we import while playing, we effectively reset the game, so solution should be reset or re-calculated.
      // Since recalculation requires worker, we reset it to null here.
      // Ideally, importing while playing should probably trigger a solve/validate flow, but currently it's just setting the board.
      solution: null,
    },
    game: { timer: 0, mistakes: 0 },
    // Preserve pool info from current state (not initialState)
    puzzlePool: state.puzzlePool,
    poolRequestCount: state.poolRequestCount,
  }
}

const handleAutoFillCandidates = (state: SudokuState): SudokuState => {
  if (state.solver.gameMode !== 'playing') {
    return state
  }

  const allCandidates = calculateCandidates(state.board)
  const newBoard = state.board.map((cell, i) => {
    if (cell.value !== null) return cell
    const candidates = allCandidates[i]
    if (candidates) {
      return {
        ...cell,
        candidates,
        centers: new Set<number>(), // Reset centers to prioritize valid candidates
      }
    }
    return cell
  })

  // Avoid updating history if nothing changed (though improbable for auto-fill)
  if (areBoardsEqual(state.board, newBoard)) {
    return state
  }

  return {
    ...state,
    board: newBoard,
    history: updateHistory(state.history, newBoard),
  }
}

/**
 * Initializes a new game from a puzzle string and solution.
 */
const initializeGameFromPuzzle = (
  state: SudokuState,
  puzzleString: string,
  solutionString: string,
): SudokuState => {
  const newBoard = boardStateFromString(puzzleString)
  const solutionNumbers = solutionString.split('').map((c) => {
    return c === '.' ? 0 : parseInt(c, 10)
  })

  return {
    ...initialState,
    board: newBoard,
    initialBoard: newBoard,
    history: {
      stack: [newBoard],
      index: 0,
    },
    solver: {
      ...initialState.solver,
      isGenerating: false,
      gameMode: 'playing',
      solution: solutionNumbers,
    },
    game: { timer: 0, mistakes: 0 },
    // Preserve existing pool data
    puzzlePool: state.puzzlePool,
    poolRequestCount: state.poolRequestCount,
  }
}

const handleGeneratePuzzleStart = (
  state: SudokuState,
  action: GeneratePuzzleStartAction,
): SudokuState => {
  // Check if we have a puzzle in the pool for this difficulty
  const pool = state.puzzlePool[action.difficulty] || []

  if (pool.length > 0) {
    // Consume from pool: Take the first puzzle
    const [nextPuzzle, ...remainingPool] = pool
    const newPool = { ...state.puzzlePool, [action.difficulty]: remainingPool }

    // Start the game immediately with the cached puzzle
    const nextState = initializeGameFromPuzzle(
      state,
      nextPuzzle.puzzleString,
      nextPuzzle.solutionString,
    )

    return {
      ...nextState,
      puzzlePool: newPool,
      // poolRequestCount is preserved by initializeGameFromPuzzle
    }
  }

  // Fallback: If pool is empty, show loading state and trigger generation (handled by hook)
  return {
    ...initialState,
    puzzlePool: state.puzzlePool,
    poolRequestCount: state.poolRequestCount,
    solver: {
      ...state.solver,
      isGenerating: true,
      generationDifficulty: action.difficulty,
    },
  }
}

const handleGeneratePuzzleSuccess = (
  state: SudokuState,
  action: GeneratePuzzleSuccessAction,
): SudokuState => {
  return initializeGameFromPuzzle(state, action.puzzleString, action.solutionString)
}

const handleRequestPoolRefill = (
  state: SudokuState,
  action: RequestPoolRefillAction,
): SudokuState => {
  return {
    ...state,
    poolRequestCount: {
      ...state.poolRequestCount,
      [action.difficulty]: (state.poolRequestCount[action.difficulty] || 0) + 1,
    },
  }
}

const handlePoolRefillSuccess = (
  state: SudokuState,
  action: PoolRefillSuccessAction,
): SudokuState => {
  const currentPool = state.puzzlePool[action.difficulty] || []
  const newPuzzle: PuzzleData = {
    puzzleString: action.puzzleString,
    solutionString: action.solutionString,
  }

  return {
    ...state,
    puzzlePool: {
      ...state.puzzlePool,
      [action.difficulty]: [...currentPool, newPuzzle],
    },
    poolRequestCount: {
      ...state.poolRequestCount,
      [action.difficulty]: Math.max(0, (state.poolRequestCount[action.difficulty] || 0) - 1),
    },
  }
}

const handleUndo = (state: SudokuState): SudokuState => {
  if (state.history.index > 0) {
    const newHistoryIndex = state.history.index - 1
    return {
      ...state,
      history: { ...state.history, index: newHistoryIndex },
      board: state.history.stack[newHistoryIndex],
      solver: { ...state.solver, isSolved: false, solveFailed: false },
    }
  }
  return state
}

const handleRedo = (state: SudokuState): SudokuState => {
  if (state.history.index < state.history.stack.length - 1) {
    const newHistoryIndex = state.history.index + 1
    return {
      ...state,
      history: { ...state.history, index: newHistoryIndex },
      board: state.history.stack[newHistoryIndex],
    }
  }
  return state
}

const handleSolveSuccess = (state: SudokuState, action: SolveSuccessAction): SudokuState => {
  const { steps, solution } = action.result
  if (!solution) {
    return {
      ...state,
      solver: { ...state.solver, isSolving: false, solveFailed: true },
    }
  }
  const solvedBoard: BoardState = solution.split('').map((char, index) => ({
    value: char === '.' ? null : parseInt(char, 10),
    isGiven: state.initialBoard[index].isGiven,
    candidates: new Set<number>(),
    centers: new Set<number>(),
  }))

  const solutionNumbers = solution.split('').map((c) => (c === '.' ? 0 : parseInt(c, 10)))

  const boardAfterLogic = state.initialBoard.map((cell) => ({ ...cell }))
  for (const step of steps) {
    for (const p of step.placements) {
      boardAfterLogic[p.index].value = p.value
    }
  }

  const finalSteps = [...steps]
  if (!boardAfterLogic.every((cell) => cell.value !== null)) {
    finalSteps.push({
      technique: 'Backtracking',
      placements: [],
      eliminations: [],
      cause: [],
    })
  }

  return {
    ...state,
    board: solvedBoard,
    solver: {
      ...state.solver,
      isSolving: false,
      isSolved: true,
      gameMode: 'visualizing',
      steps: finalSteps,
      currentStepIndex: finalSteps.length,
      visualizationBoard: solvedBoard,
      solution: solutionNumbers,
    },
  }
}

/**
 * Reconstructs the board state by applying solver steps up to a given index.
 */
const reconstructBoard = (
  initialBoard: BoardState,
  steps: readonly SolvingStep[],
  upTo: number,
): BoardState => {
  const board = initialBoard.map((c) => ({
    ...c,
    candidates: new Set<number>(),
    centers: new Set<number>(),
  }))

  for (let i = 0; i < upTo; i++) {
    for (const p of steps[i].placements) {
      board[p.index].value = p.value
    }
  }
  return board
}

/**
 * Reconstructs the candidate sets by re-calculating them for the board state
 * prior to the current step, and then applying historical eliminations.
 */
const reconstructCandidates = (
  initialBoard: BoardState,
  steps: readonly SolvingStep[],
  upTo: number,
) => {
  // Reconstruct board state *before* the specific step to calculate raw candidates
  const board = reconstructBoard(initialBoard, steps, upTo)
  const candidates = calculateCandidates(board)

  // Re-apply specific eliminations from history up to this point
  for (let i = 0; i < upTo; i++) {
    for (const elim of steps[i].eliminations) {
      candidates[elim.index]?.delete(elim.value)
    }
  }
  return candidates
}

/**
 * Determines which value should be highlighted based on the current step's placements.
 */
const getHighlightedValueForStep = (
  steps: readonly SolvingStep[],
  stepIndex: number,
): number | null => {
  if (stepIndex > 0 && stepIndex <= steps.length) {
    const currentStep = steps[stepIndex - 1]
    if (currentStep.placements.length > 0) {
      return currentStep.placements[0].value
    }
  }
  return null
}

const handleViewSolverStep = (state: SudokuState, action: ViewSolverStepAction): SudokuState => {
  if (state.solver.gameMode !== 'visualizing') return state

  let visualizationBoard: BoardState

  if (action.index === state.solver.steps.length) {
    // Show the fully solved board (which is stored in state.board during visualization)
    // but sanitized of pencil marks for display consistency
    visualizationBoard = state.board.map((c) => ({
      ...c,
      candidates: new Set<number>(),
      centers: new Set<number>(),
    }))
  } else {
    visualizationBoard = reconstructBoard(state.initialBoard, state.solver.steps, action.index)
  }

  // Calculate candidates and eliminations based on the state *before* the current step is applied
  const previousStepIndex = Math.max(0, action.index - 1)
  const candidates = reconstructCandidates(
    state.initialBoard,
    state.solver.steps,
    previousStepIndex,
  )

  const eliminations = action.index > 0 ? state.solver.steps[action.index - 1].eliminations : []

  const newHighlightedValue = getHighlightedValueForStep(state.solver.steps, action.index)

  return {
    ...state,
    ui: {
      ...state.ui,
      highlightedValue: newHighlightedValue,
    },
    solver: {
      ...state.solver,
      currentStepIndex: action.index,
      visualizationBoard,
      candidatesForViz: candidates,
      eliminationsForViz: eliminations,
    },
  }
}

const handleExitVisualization = (state: SudokuState): SudokuState => ({
  ...state,
  board: state.initialBoard,
  solver: {
    ...state.solver,
    gameMode: 'playing',
    steps: [],
    currentStepIndex: null,
    visualizationBoard: null,
    candidatesForViz: null,
    eliminationsForViz: null,
    solution: state.solver.solution,
    isSolved: false,
  },
  ui: {
    ...state.ui,
    highlightedValue: null,
  },
})

const handleSetActiveCell = (state: SudokuState, action: SetActiveCellAction): SudokuState => ({
  ...state,
  ui: {
    ...state.ui,
    activeCellIndex: action.index,
    highlightedValue: action.index !== null ? state.board[action.index].value : null,
    lastError: null,
  },
})

const handleValidatePuzzleSuccess = (
  state: SudokuState,
  action: ValidatePuzzleSuccessAction,
): SudokuState => {
  const newInitialBoard = state.board.map((cell) => ({
    ...cell,
    isGiven: cell.value !== null,
  }))
  const solutionNumbers = action.solutionString.split('').map((c) => {
    return c === '.' ? 0 : parseInt(c, 10)
  })

  return {
    ...state,
    initialBoard: newInitialBoard,
    board: newInitialBoard,
    history: {
      stack: [newInitialBoard],
      index: 0,
    },
    solver: {
      ...state.solver,
      isValidating: false,
      gameMode: 'playing',
      solution: solutionNumbers,
    },
    game: { timer: 0, mistakes: 0 },
  }
}

const handleValidatePuzzleFailure = (
  state: SudokuState,
  action: ValidatePuzzleFailureAction,
): SudokuState => ({
  ...state,
  solver: {
    ...state.solver,
    isValidating: false,
  },
  ui: {
    ...state.ui,
    lastError: action.error,
  },
})

export function sudokuReducer(state: SudokuState, action: SudokuAction): SudokuState {
  let newState: SudokuState

  switch (action.type) {
    case 'SET_CELL_VALUE':
      newState = handleSetCellValue(state, action)
      break
    case 'TOGGLE_PENCIL_MARK':
      newState = handleTogglePencilMark(state, action)
      break
    case 'ERASE_CELL':
      newState = handleEraseCell(state, action)
      break
    case 'CLEAR_BOARD':
      newState = handleClearBoard(state)
      break
    case 'IMPORT_BOARD':
      newState = handleImportBoard(state, action)
      break
    case 'AUTO_FILL_CANDIDATES':
      newState = handleAutoFillCandidates(state)
      break
    case 'UNDO':
      newState = handleUndo(state)
      break
    case 'REDO':
      newState = handleRedo(state)
      break
    case 'SOLVE_START':
      newState = {
        ...state,
        solver: { ...state.solver, isSolving: true },
      }
      break
    case 'SOLVE_SUCCESS':
      newState = handleSolveSuccess(state, action)
      break
    case 'SOLVE_FAILURE':
      newState = {
        ...state,
        solver: { ...state.solver, isSolving: false, solveFailed: true },
      }
      break
    case 'GENERATE_PUZZLE_START':
      newState = handleGeneratePuzzleStart(state, action)
      break
    case 'GENERATE_PUZZLE_SUCCESS':
      newState = handleGeneratePuzzleSuccess(state, action)
      break
    case 'GENERATE_PUZZLE_FAILURE':
      newState = {
        ...state,
        solver: { ...state.solver, isGenerating: false },
        ui: { ...state.ui, lastError: 'Failed to generate a new puzzle.' },
      }
      break
    case 'REQUEST_POOL_REFILL':
      newState = handleRequestPoolRefill(state, action)
      break
    case 'POOL_REFILL_SUCCESS':
      newState = handlePoolRefillSuccess(state, action)
      break
    case 'VALIDATE_PUZZLE_START':
      newState = { ...state, solver: { ...state.solver, isValidating: true } }
      break
    case 'VALIDATE_PUZZLE_SUCCESS':
      newState = handleValidatePuzzleSuccess(state, action)
      break
    case 'VALIDATE_PUZZLE_FAILURE':
      newState = handleValidatePuzzleFailure(state, action)
      break
    case 'START_CUSTOM_PUZZLE':
      newState = {
        ...initialState,
        solver: { ...initialState.solver, gameMode: 'customInput' },
        puzzlePool: state.puzzlePool,
        poolRequestCount: state.poolRequestCount,
      }
      break
    case 'VIEW_SOLVER_STEP':
      newState = handleViewSolverStep(state, action)
      break
    case 'EXIT_VISUALIZATION':
      newState = handleExitVisualization(state)
      break
    case 'SET_ACTIVE_CELL':
      newState = handleSetActiveCell(state, action)
      break
    case 'SET_INPUT_MODE':
      newState = { ...state, ui: { ...state.ui, inputMode: action.mode } }
      break
    case 'CLEAR_ERROR':
      newState = { ...state, ui: { ...state.ui, lastError: null } }
      break
    case 'SET_HIGHLIGHTED_VALUE':
      newState = { ...state, ui: { ...state.ui, highlightedValue: action.value } }
      break
    case 'TICK_TIMER':
      newState = { ...state, game: { ...state.game, timer: state.game.timer + 1 } }
      break
    default:
      newState = state
  }

  if (newState.board !== state.board) {
    return {
      ...newState,
      derived: getDerivedBoardState(newState.board),
    }
  }

  return newState
}
