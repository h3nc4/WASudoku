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

import { validateBoard } from '@/lib/utils'

import type { BoardState, HistoryState, SudokuState } from '../sudoku.types'

const BOARD_SIZE = 81
const MAX_HISTORY_ENTRIES = 100

export const isBoardSolved = (board: BoardState, solution: readonly number[] | null): boolean =>
  solution !== null && board.every((cell, i) => cell.value === solution[i])

export const createEmptyBoard = (): BoardState =>
  new Array(BOARD_SIZE).fill(null).map(() => ({
    value: null,
    isGiven: false,
    candidates: new Set<number>(),
    centers: new Set<number>(),
  }))

export function getDerivedBoardState(board: BoardState) {
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
    transientConflicts: null,
    conflictPulse: 0,
    hint: null,
    isPaused: false,
    pendingPuzzle: null,
    sticky: false,
    stickyValue: null,
  },
  solver: {
    isSolving: false,
    isGenerating: false,
    isValidating: false,
    isHinting: false,
    generationDifficulty: null,
    difficulty: null,
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
    expert: [],
    extreme: [],
  },
  poolRequestCount: {
    easy: 0,
    medium: 0,
    hard: 0,
    expert: 0,
    extreme: 0,
  },
}

/** A fresh game over the given fields, keeping the puzzle pool and its in-flight requests. */
export const startGame = (
  state: SudokuState,
  overrides: Omit<Partial<SudokuState>, 'puzzlePool' | 'poolRequestCount'>,
): SudokuState => ({
  ...initialState,
  // Sticky numbers is a preference kept across puzzles, while its lock resets with each one.
  ui: { ...initialState.ui, sticky: state.ui.sticky },
  ...overrides,
  puzzlePool: state.puzzlePool,
  poolRequestCount: state.poolRequestCount,
})

export function updateHistory(historyState: HistoryState, newBoard: BoardState): HistoryState {
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

/** Puzzle clues are fixed while playing, and only editable while typing in a puzzle. */
export const isLockedGiven = (state: SudokuState, index: number): boolean =>
  state.solver.gameMode === 'playing' && state.board[index].isGiven
