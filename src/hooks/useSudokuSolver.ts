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

import { useEffect, useRef, type Dispatch } from 'react'
import { toast } from 'sonner'
import type { SudokuAction } from '@/context/sudoku.actions.types'
import type { SudokuState, SolveResult } from '@/context/sudoku.types'
import {
  solveSuccess,
  solveFailure,
  generatePuzzleSuccess,
  generatePuzzleFailure,
  validatePuzzleSuccess,
  validatePuzzleFailure,
} from '@/context/sudoku.actions'
import SolverWorker from '@/workers/sudoku.worker?worker'

const WORKER_UNAVAILABLE_ERROR = 'Solver functionality is unavailable.'

/**
 * Manages the Sudoku solver Web Worker. It handles initializing the worker,
 * posting tasks to it (solving, generating), and dispatching actions based
 * on the worker's response (success or error).
 *
 * @param state - The current Sudoku state.
 * @param dispatch - The dispatch function from the Sudoku reducer.
 */
export function useSudokuSolver(state: SudokuState, dispatch: Dispatch<SudokuAction>) {
  const workerRef = useRef<Worker | null>(null)
  const { isSolving, isGenerating, isValidating, generationDifficulty } = state.solver
  const { board } = state

  // Effect for managing the worker's lifecycle.
  useEffect(() => {
    try {
      workerRef.current = new SolverWorker()
    } catch (error) {
      console.error('Failed to initialize solver worker:', error)
      toast.error(WORKER_UNAVAILABLE_ERROR)
    }

    // Cleanup: terminate the worker on unmount.
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, []) // Empty dependency array ensures this runs only on mount/unmount.

  // Effect for handling messages from the worker.
  useEffect(() => {
    const worker = workerRef.current
    if (!worker) return

    const handleError = (error: string) => {
      console.error('Solver worker error:', error)
      switch (true) {
        case isSolving:
          dispatch(solveFailure())
          break
        case isGenerating:
          dispatch(generatePuzzleFailure())
          break
        case isValidating:
          dispatch(validatePuzzleFailure(error))
          break
      }
      toast.error(`Operation failed: ${error}`)
    }

    const handleWorkerMessage = (
      event: MessageEvent<{
        type: 'solution' | 'puzzle_generated' | 'validation_result' | 'error'
        result?: SolveResult
        puzzleString?: string
        isValid?: boolean
        error?: string
      }>,
    ) => {
      const { type, result, puzzleString, isValid, error } = event.data

      if (type === 'solution' && result) {
        dispatch(solveSuccess(result))
        toast.success('Sudoku solved successfully!')
      } else if (type === 'puzzle_generated' && puzzleString) {
        dispatch(generatePuzzleSuccess(puzzleString))
        toast.success('New puzzle generated!')
      } else if (type === 'validation_result') {
        if (isValid) {
          dispatch(validatePuzzleSuccess())
          toast.success('Puzzle is valid and has a unique solution.')
        } else {
          dispatch(validatePuzzleFailure('Puzzle is invalid or does not have a unique solution.'))
        }
      } else if (type === 'error' && error) {
        handleError(error)
      }
    }

    worker.addEventListener('message', handleWorkerMessage)
    return () => {
      worker.removeEventListener('message', handleWorkerMessage)
    }
  }, [dispatch, isSolving, isGenerating, isValidating])

  // Effect to trigger the solver, generator, or validator.
  useEffect(() => {
    if (!isSolving && !isGenerating && !isValidating) {
      return
    }

    if (!workerRef.current) {
      toast.error(WORKER_UNAVAILABLE_ERROR)
      if (isSolving) dispatch(solveFailure())
      if (isGenerating) dispatch(generatePuzzleFailure())
      if (isValidating)
        dispatch(validatePuzzleFailure('Validation service is currently unavailable.'))
      return
    }

    if (isSolving) {
      const boardString = board.map((cell) => cell.value ?? '.').join('')
      workerRef.current.postMessage({ type: 'solve', boardString })
    } else if (isGenerating && generationDifficulty) {
      workerRef.current.postMessage({
        type: 'generate',
        difficulty: generationDifficulty,
      })
    } else if (isValidating) {
      const boardString = board.map((cell) => cell.value ?? '.').join('')
      workerRef.current.postMessage({ type: 'validate', boardString })
    }
  }, [isSolving, isGenerating, isValidating, generationDifficulty, board, dispatch])
}
