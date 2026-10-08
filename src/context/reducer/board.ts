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

import { clearCell, placeValue, toggleMark } from '@/lib/board'
import { areBoardsEqual, calculateCandidates, getConflictingPeers, isMoveValid } from '@/lib/utils'

import type {
  EraseActiveCellAction,
  EraseCellAction,
  InputValueAction,
  NavigateAction,
  SetActiveCellAction,
  SetCellValueAction,
  TogglePencilMarkAction,
} from '../sudoku.actions.types'
import type { SudokuState } from '../sudoku.types'
import { createEmptyBoard, isBoardSolved, isLockedGiven, updateHistory } from './state'

export const handleSetCellValue = (state: SudokuState, action: SetCellValueAction): SudokuState => {
  const { index, value } = action
  if (state.board[index].value === value || isLockedGiven(state, index)) {
    return state
  }

  const newBoard = placeValue(state.board, index, value)

  // Track mistakes if solution is known
  let mistakes = state.game.mistakes
  let isSolved = false

  if (state.solver.gameMode === 'playing' && state.solver.solution) {
    if (state.solver.solution[index] !== value) {
      mistakes += 1
    } else {
      isSolved = isBoardSolved(newBoard, state.solver.solution)
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

export const handleTogglePencilMark = (
  state: SudokuState,
  action: TogglePencilMarkAction,
): SudokuState => {
  if (state.board[action.index].value !== null || isLockedGiven(state, action.index)) {
    return state
  }

  const newBoard = toggleMark(state.board, action.index, action.mode, action.value)
  if (newBoard === state.board) {
    return state // Do not add a conflicting mark
  }

  return {
    ...state,
    board: newBoard,
    history: updateHistory(state.history, newBoard),
    solver: { ...state.solver, solveFailed: false },
  }
}

export const handleEraseCell = (state: SudokuState, action: EraseCellAction): SudokuState => {
  const { index } = action
  const cell = state.board[index]
  if (
    (cell.value === null && cell.candidates.size === 0 && cell.centers.size === 0) ||
    isLockedGiven(state, index)
  ) {
    return state
  }

  const newBoard = clearCell(state.board, index)

  return {
    ...state,
    board: newBoard,
    history: updateHistory(state.history, newBoard),
    solver: { ...state.solver, isSolved: false, solveFailed: false },
  }
}

export const handleClearBoard = (state: SudokuState): SudokuState => {
  if (state.solver.gameMode === 'playing') {
    // Revert to initial puzzle, clearing user progress.
    if (areBoardsEqual(state.board, state.initialBoard)) {
      return state
    }
    // Kept in history so the clear can be undone, and metrics stay so undo is not a reset.
    const newBoard = state.initialBoard
    return {
      ...state,
      board: newBoard,
      history: updateHistory(state.history, newBoard),
      solver: { ...state.solver, isSolved: false, solveFailed: false },
      ui: { ...state.ui, activeCellIndex: null, highlightedValue: null, transientConflicts: null },
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
      history: updateHistory(state.history, newBoard),
      solver: { ...state.solver, solution: null },
      ui: { ...state.ui, activeCellIndex: null, highlightedValue: null, transientConflicts: null },
    }
  }

  // The button should be disabled in other modes, but if this action is
  // dispatched somehow, this is a safe fallback.
  return state
}

export const handleAutoFillCandidates = (state: SudokuState): SudokuState => {
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

export const handleUndo = (state: SudokuState): SudokuState => {
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

export const handleRedo = (state: SudokuState): SudokuState => {
  if (state.history.index < state.history.stack.length - 1) {
    const newHistoryIndex = state.history.index + 1
    return {
      ...state,
      history: { ...state.history, index: newHistoryIndex },
      board: state.history.stack[newHistoryIndex],
      solver: {
        ...state.solver,
        isSolved:
          state.solver.gameMode === 'playing' &&
          isBoardSolved(state.history.stack[newHistoryIndex], state.solver.solution),
      },
    }
  }
  return state
}

export const handleSetActiveCell = (
  state: SudokuState,
  action: SetActiveCellAction,
): SudokuState => ({
  ...state,
  ui: {
    ...state.ui,
    activeCellIndex: action.index,
    highlightedValue: action.index === null ? null : state.board[action.index].value,
    lastError: null,
  },
})

export const handleInputValue = (state: SudokuState, action: InputValueAction): SudokuState => {
  const { activeCellIndex: index, inputMode } = state.ui
  if (index === null || isLockedGiven(state, index)) return state
  const { value } = action

  if (inputMode === 'normal') {
    const next = handleSetCellValue(state, { type: 'SET_CELL_VALUE', index, value })
    // Advancing helps while typing in a puzzle, but during play it jumps off the cell just filled.
    const advance =
      state.solver.gameMode === 'customInput' &&
      isMoveValid(state.board, index, value) &&
      index < 80
    return advance ? handleSetActiveCell(next, { type: 'SET_ACTIVE_CELL', index: index + 1 }) : next
  }

  const cell = state.board[index]
  const hasMark = inputMode === 'candidate' ? cell.candidates.has(value) : cell.centers.has(value)
  // Removing a mark is always allowed, while adding one that clashes highlights the clash instead.
  if (!hasMark) {
    const conflicts = getConflictingPeers(state.board, index, value)
    if (conflicts.size > 0) {
      return {
        ...state,
        ui: {
          ...state.ui,
          transientConflicts: conflicts,
          conflictPulse: state.ui.conflictPulse + 1,
        },
      }
    }
  }
  return handleTogglePencilMark(state, {
    type: 'TOGGLE_PENCIL_MARK',
    index,
    value,
    mode: inputMode,
  })
}

export const handleNavigate = (state: SudokuState, action: NavigateAction): SudokuState => {
  const index = state.ui.activeCellIndex
  if (index === null) return state

  let nextIndex = -1
  const { direction } = action
  if (direction === 'right' && index < 80) nextIndex = index + 1
  else if (direction === 'left' && index > 0) nextIndex = index - 1
  else if (direction === 'down' && index < 72) nextIndex = index + 9
  else if (direction === 'up' && index > 8) nextIndex = index - 9

  return nextIndex === -1
    ? state
    : handleSetActiveCell(state, { type: 'SET_ACTIVE_CELL', index: nextIndex })
}

export const handleEraseActiveCell = (
  state: SudokuState,
  action: EraseActiveCellAction,
): SudokuState => {
  const index = state.ui.activeCellIndex
  if (index === null) return state

  // Clues are never erased, but backspace still moves off one.
  const erased = isLockedGiven(state, index)
    ? state
    : handleEraseCell(state, { type: 'ERASE_CELL', index })
  return action.mode === 'backspace' && index > 0
    ? handleSetActiveCell(erased, { type: 'SET_ACTIVE_CELL', index: index - 1 })
    : erased
}
