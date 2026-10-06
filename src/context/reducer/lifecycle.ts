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

import { parseSolution } from '@/lib/board'
import { boardStateFromString } from '@/lib/utils'

import type {
  GeneratePuzzleStartAction,
  GeneratePuzzleSuccessAction,
  ImportBoardAction,
  LoadPuzzleAction,
  PoolRefillFailureAction,
  PoolRefillSuccessAction,
  RequestPoolRefillAction,
  ValidatePuzzleFailureAction,
  ValidatePuzzleSuccessAction,
} from '../sudoku.actions.types'
import { loadPersistedState } from '../sudoku.persistence'
import { isClockRunning } from '../sudoku.selectors'
import type { Difficulty, PuzzleData, SavedGame, SudokuState } from '../sudoku.types'
import {
  createEmptyBoard,
  getDerivedBoardState,
  initialState,
  isBoardSolved,
  startGame,
} from './state'

/** Resolves the board, history and mode from a saved game, or a fresh one without it. */
function resolveGameState(game: SavedGame | null) {
  if (game) {
    return {
      board: game.history.stack[game.history.index],
      initialBoard: game.initialBoard,
      history: game.history,
      gameMode: 'playing' as const,
      solution: game.solution,
      difficulty: game.difficulty,
    }
  }

  return {
    board: createEmptyBoard(),
    initialBoard: createEmptyBoard(),
    history: initialState.history,
    gameMode: 'selecting' as const,
    solution: null,
    difficulty: null,
  }
}

export function loadInitialState(): SudokuState {
  const { game, metrics, puzzlePool } = loadPersistedState()

  if (!game && !metrics && !puzzlePool) {
    return initialState
  }

  const { board, initialBoard, history, gameMode, solution, difficulty } = resolveGameState(game)

  return {
    ...initialState,
    board,
    initialBoard,
    history,
    solver: {
      ...initialState.solver,
      gameMode,
      solution,
      difficulty,
      isSolved: gameMode === 'playing' && isBoardSolved(board, solution),
    },
    derived: getDerivedBoardState(board),
    game: metrics ?? initialState.game,
    puzzlePool: puzzlePool ?? initialState.puzzlePool,
    // A page refresh drops every in-flight request, so the count always starts at zero.
    poolRequestCount: initialState.poolRequestCount,
  }
}

export const handleImportBoard = (state: SudokuState, action: ImportBoardAction): SudokuState => {
  const newBoard = boardStateFromString(action.boardString)
  const gameMode = state.solver.gameMode === 'customInput' ? 'customInput' : 'playing'

  return startGame(state, {
    board: newBoard,
    initialBoard: gameMode === 'playing' ? newBoard : initialState.initialBoard,
    history: {
      stack: [newBoard],
      index: 0,
    },
    solver: {
      ...initialState.solver,
      gameMode,
      // Importing resets the game, and recomputing the solution needs the worker, so it is cleared.
      // A solve or validate flow after import would be better, but for now it only sets the board.
      solution: null,
    },
    game: { timer: 0, mistakes: 0 },
  })
}

/** Initializes a new game from a puzzle string and solution. */
const initializeGameFromPuzzle = (
  state: SudokuState,
  puzzleString: string,
  solutionString: string,
  difficulty: Difficulty | null,
): SudokuState => {
  const newBoard = boardStateFromString(puzzleString)
  const solutionNumbers = parseSolution(solutionString)

  return startGame(state, {
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
      difficulty,
    },
    game: { timer: 0, mistakes: 0 },
  })
}

export const handleGeneratePuzzleStart = (
  state: SudokuState,
  action: GeneratePuzzleStartAction,
): SudokuState => {
  // Check if we have a puzzle in the pool for this difficulty
  const pool = state.puzzlePool[action.difficulty]

  if (pool.length > 0) {
    // Consume from pool: Take the first puzzle
    const [nextPuzzle, ...remainingPool] = pool
    const newPool = { ...state.puzzlePool, [action.difficulty]: remainingPool }

    // Start the game immediately with the cached puzzle
    const nextState = initializeGameFromPuzzle(
      state,
      nextPuzzle.puzzleString,
      nextPuzzle.solutionString,
      action.difficulty,
    )

    return {
      ...nextState,
      puzzlePool: newPool,
      // poolRequestCount is preserved by initializeGameFromPuzzle
    }
  }

  // Fallback: If pool is empty, show loading state and trigger generation (handled by hook)
  return startGame(state, {
    solver: {
      ...state.solver,
      isGenerating: true,
      generationDifficulty: action.difficulty,
    },
  })
}

export const handleGeneratePuzzleSuccess = (
  state: SudokuState,
  action: GeneratePuzzleSuccessAction,
): SudokuState => {
  return initializeGameFromPuzzle(
    state,
    action.puzzleString,
    action.solutionString,
    state.solver.generationDifficulty,
  )
}

export const handleGeneratePuzzleFailure = (state: SudokuState): SudokuState => ({
  ...state,
  solver: { ...state.solver, isGenerating: false },
  ui: { ...state.ui, lastError: 'Failed to generate a new puzzle.' },
})

export const handleRequestPoolRefill = (
  state: SudokuState,
  action: RequestPoolRefillAction,
): SudokuState => {
  return {
    ...state,
    poolRequestCount: {
      ...state.poolRequestCount,
      [action.difficulty]: state.poolRequestCount[action.difficulty] + 1,
    },
  }
}

export const handlePoolRefillSuccess = (
  state: SudokuState,
  action: PoolRefillSuccessAction,
): SudokuState => {
  const currentPool = state.puzzlePool[action.difficulty]
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
      [action.difficulty]: Math.max(0, state.poolRequestCount[action.difficulty] - 1),
    },
  }
}

export const handlePoolRefillFailure = (
  state: SudokuState,
  action: PoolRefillFailureAction,
): SudokuState => {
  return {
    ...state,
    poolRequestCount: {
      ...state.poolRequestCount,
      [action.difficulty]: Math.max(0, state.poolRequestCount[action.difficulty] - 1),
    },
  }
}

export const handleValidatePuzzleStart = (state: SudokuState): SudokuState => ({
  ...state,
  solver: { ...state.solver, isValidating: true },
})

export const handleValidatePuzzleSuccess = (
  state: SudokuState,
  action: ValidatePuzzleSuccessAction,
): SudokuState => {
  const newInitialBoard = state.board.map((cell) => ({
    ...cell,
    isGiven: cell.value !== null,
  }))
  const solutionNumbers = parseSolution(action.solutionString)

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
      difficulty: null,
    },
    game: { timer: 0, mistakes: 0 },
  }
}

export const handleValidatePuzzleFailure = (
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

export const handleStartCustomPuzzle = (state: SudokuState): SudokuState =>
  startGame(state, {
    solver: { ...initialState.solver, gameMode: 'customInput' },
  })

export const handleLoadPuzzle = (state: SudokuState, action: LoadPuzzleAction): SudokuState => {
  const newBoard = boardStateFromString(action.boardString)
  return startGame(state, {
    board: newBoard,
    history: { stack: [newBoard], index: 0 },
    solver: { ...initialState.solver, gameMode: 'customInput', isValidating: true },
  })
}

export const handleTickTimer = (state: SudokuState): SudokuState => ({
  ...state,
  game: { ...state.game, timer: state.game.timer + 1 },
})

export const handlePauseGame = (state: SudokuState): SudokuState => {
  if (!isClockRunning(state)) {
    return state
  }
  return {
    ...state,
    ui: { ...state.ui, isPaused: true, activeCellIndex: null, highlightedValue: null },
  }
}

export const handleResumeGame = (state: SudokuState): SudokuState => ({
  ...state,
  ui: { ...state.ui, isPaused: false },
})
