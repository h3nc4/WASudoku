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

import { useMemo } from 'react'
import { toast } from 'sonner'

import * as actions from '@/context/sudoku.actions'
import { useSudokuDispatch, useSudokuState } from '@/context/sudoku.hooks'
import type { InputMode } from '@/context/sudoku.types'
import { boardStateToString, getConflictingPeers, isMoveValid } from '@/lib/utils'

/**
 * Provides a stable, memoized API for dispatching all Sudoku actions.
 * This hook acts as the "intent interpretation" layer, translating high-level
 * user actions into the specific low-level mutations sent to the reducer.
 *
 * @returns An object containing functions to dispatch all possible user intents.
 */
export function useSudokuActions() {
  const state = useSudokuState()
  const dispatch = useSudokuDispatch()

  // The returned object has a stable identity, preventing unnecessary re-renders.
  return useMemo(() => {
    const handleNormalInput = (index: number, value: number) => {
      dispatch(actions.setCellValue(index, value))
      if (isMoveValid(state.board, index, value) && index < 80) {
        dispatch(actions.setActiveCell(index + 1))
      }
    }

    const handlePencilMarkInput = (index: number, value: number, mode: 'candidate' | 'center') => {
      const cell = state.board[index]
      const hasMark = mode === 'candidate' ? cell.candidates.has(value) : cell.centers.has(value)

      if (hasMark) {
        // Toggling off is always allowed
        dispatch(actions.togglePencilMark(index, value, mode))
      } else {
        // Toggling on requires validation against peers
        const conflicts = getConflictingPeers(state.board, index, value)
        if (conflicts.size === 0) {
          dispatch(actions.togglePencilMark(index, value, mode))
        } else {
          // Invalid move: highlight conflicts instead of toggling
          dispatch(actions.setTransientConflicts(conflicts))
        }
      }
    }

    return {
      /** Sets the active cell and updates the highlighted value. */
      setActiveCell: (index: number | null) => {
        dispatch(actions.setActiveCell(index))
      },

      /** Inputs a value, respecting the current input mode. */
      inputValue: (value: number) => {
        const { activeCellIndex, inputMode } = state.ui
        if (activeCellIndex === null) return

        // Prevent modification of "given" cells in playing mode.
        if (state.solver.gameMode === 'playing' && state.board[activeCellIndex].isGiven) {
          return
        }

        if (inputMode === 'normal') {
          handleNormalInput(activeCellIndex, value)
        } else {
          handlePencilMarkInput(activeCellIndex, value, inputMode)
        }
      },

      /** Navigates the grid from the active cell. */
      navigate: (direction: 'up' | 'down' | 'left' | 'right') => {
        if (state.ui.activeCellIndex === null) return
        let nextIndex = -1
        const { activeCellIndex } = state.ui

        if (direction === 'right' && activeCellIndex < 80) nextIndex = activeCellIndex + 1
        else if (direction === 'left' && activeCellIndex > 0) nextIndex = activeCellIndex - 1
        else if (direction === 'down' && activeCellIndex < 72) nextIndex = activeCellIndex + 9
        else if (direction === 'up' && activeCellIndex > 8) nextIndex = activeCellIndex - 9

        if (nextIndex !== -1) {
          dispatch(actions.setActiveCell(nextIndex))
        }
      },

      /** Erases the active cell's content. */
      eraseActiveCell: (mode: 'delete' | 'backspace') => {
        if (state.ui.activeCellIndex === null) return

        // Prevent erasing "given" cells, but still allow backspace to navigate away.
        if (state.solver.gameMode === 'playing' && state.board[state.ui.activeCellIndex].isGiven) {
          if (mode === 'backspace' && state.ui.activeCellIndex > 0) {
            dispatch(actions.setActiveCell(state.ui.activeCellIndex - 1))
          }
          return
        }

        dispatch(actions.eraseCell(state.ui.activeCellIndex))

        if (mode === 'backspace' && state.ui.activeCellIndex > 0) {
          dispatch(actions.setActiveCell(state.ui.activeCellIndex - 1))
        }
      },

      /** Clears the entire board. */
      clearBoard: () => dispatch(actions.clearBoard()),
      /** Automatically fills candidates for all empty cells. */
      autoFillCandidates: () => dispatch(actions.autoFillCandidates()),
      /** Exports the current board state to the clipboard. */
      exportBoard: () => {
        if (!navigator.clipboard) {
          toast.error('Clipboard API not available in this browser or context.')
          return
        }
        const boardString = boardStateToString(state.board)
        navigator.clipboard
          .writeText(boardString)
          .then(() => {
            toast.success('Board exported to clipboard.')
          })
          .catch(() => {
            toast.error('Failed to copy board to clipboard.')
          })
      },
      /** Undoes the last move. */
      undo: () => dispatch(actions.undo()),
      /** Redoes the last undone move. */
      redo: () => dispatch(actions.redo()),
      /** Starts the solver. */
      solve: () => dispatch(actions.solveStart()),
      /** Starts the puzzle generator. */
      generatePuzzle: (difficulty: string) => {
        dispatch(actions.generatePuzzleStart(difficulty))
      },
      /** Starts the custom puzzle validation process. */
      validatePuzzle: () => dispatch(actions.validatePuzzleStart()),
      /** Enters the custom puzzle creation mode. */
      startCustomPuzzle: () => dispatch(actions.startCustomPuzzle()),
      /** Exits the solver visualization mode. */
      exitVisualization: () => dispatch(actions.exitVisualization()),
      /** Changes the input mode. */
      setInputMode: (mode: InputMode) => dispatch(actions.setInputMode(mode)),
      /** Sets the globally highlighted number. */
      setHighlightedValue: (value: number | null) => dispatch(actions.setHighlightedValue(value)),
      /** Jumps to a specific step in the solver visualization. */
      viewSolverStep: (index: number) => dispatch(actions.viewSolverStep(index)),
    }
  }, [state, dispatch])
}
