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

import { useMemo } from 'react'
import { toast } from 'sonner'

import * as actions from '@/context/sudoku.actions'
import type { NavigateAction } from '@/context/sudoku.actions.types'
import { useSudokuDispatch } from '@/context/sudoku.hooks'
import type { BoardState, Difficulty, InputMode } from '@/context/sudoku.types'
import { buildShareUrl } from '@/lib/share'
import { boardStateToString } from '@/lib/utils'

/** Copies text to the clipboard, reporting the outcome in a toast. */
function copyToClipboard(text: string, successMessage: string) {
  if (!navigator.clipboard) {
    toast.error('Clipboard API not available in this browser or context.')
    return
  }
  navigator.clipboard
    .writeText(text)
    .then(() => {
      toast.success(successMessage)
    })
    .catch(() => {
      toast.error('Failed to copy to clipboard.')
    })
}

/** Provides a stable API for every user intent, and the reducer resolves those that read state. */
export function useSudokuActions() {
  const dispatch = useSudokuDispatch()

  // Depending on dispatch alone keeps memoized cells from re-rendering on every timer tick.
  return useMemo(() => {
    return {
      /** Sets the active cell and updates the highlighted value. */
      setActiveCell: (index: number | null) => {
        dispatch(actions.setActiveCell(index))
      },

      /** Inputs a value, respecting the current input mode. */
      inputValue: (value: number) => dispatch(actions.inputValue(value)),

      /** Navigates the grid from the active cell. */
      navigate: (direction: NavigateAction['direction']) => dispatch(actions.navigate(direction)),

      /** Erases the active cell's content. */
      eraseActiveCell: (mode: 'delete' | 'backspace') => dispatch(actions.eraseActiveCell(mode)),

      /** Clears the entire board. */
      clearBoard: () => dispatch(actions.clearBoard()),
      /** Automatically fills candidates for all empty cells. */
      autoFillCandidates: () => dispatch(actions.autoFillCandidates()),
      /** Copies a board to the clipboard as an 81-character string. */
      exportBoard: (board: BoardState) => {
        copyToClipboard(boardStateToString(board), 'Board exported to clipboard.')
      },
      /** Copies a link that opens this puzzle. */
      sharePuzzleLink: (puzzle: BoardState) => {
        const url = buildShareUrl(boardStateToString(puzzle), globalThis.location.href)
        copyToClipboard(url, 'Puzzle link copied to clipboard.')
      },
      /** Undoes the last move. */
      undo: () => dispatch(actions.undo()),
      /** Redoes the last undone move. */
      redo: () => dispatch(actions.redo()),
      /** Starts the solver. */
      solve: () => dispatch(actions.solveStart()),
      /** Starts the puzzle generator. */
      generatePuzzle: (difficulty: Difficulty) => {
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
      /** Moves the solver visualization one step back or forward. */
      stepVisualization: (delta: -1 | 1) => dispatch(actions.stepVisualization(delta)),
      /** Switches to the next input mode, wrapping from Center back to Normal. */
      cycleInputMode: () => dispatch(actions.cycleInputMode()),
      /** Turns sticky numbers on or off. */
      toggleSticky: () => dispatch(actions.toggleSticky()),
      /** Locks a digit for cell taps, or releases the lock with null. */
      setStickyValue: (value: number | null) => dispatch(actions.setStickyValue(value)),
      /** Applies the locked digit to a tapped cell. */
      tapCell: (index: number) => dispatch(actions.tapCell(index)),
      /** Asks the solver for the next move on the current board. */
      requestHint: () => dispatch(actions.requestHint()),
      /** Dismisses the current hint. */
      clearHint: () => dispatch(actions.clearHint()),
      /** Pauses the game, hiding the board. */
      pauseGame: () => dispatch(actions.pauseGame()),
      /** Resumes a paused game. */
      resumeGame: () => dispatch(actions.resumeGame()),
      /** Asks the player whether to load a puzzle string. */
      offerPuzzle: (boardString: string) => dispatch(actions.offerPuzzle(boardString)),
      /** Declines the offered puzzle. */
      dismissPuzzle: () => dispatch(actions.dismissPuzzle()),
      /** Validates and starts a puzzle from a string. */
      loadPuzzle: (boardString: string) => dispatch(actions.loadPuzzle(boardString)),
    }
  }, [dispatch])
}
