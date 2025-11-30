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
  requestPoolRefill,
  poolRefillSuccess,
} from '@/context/sudoku.actions'
import SolverWorker from '@/workers/sudoku.worker?worker'

const WORKER_UNAVAILABLE_ERROR = 'Solver functionality is unavailable.'
const MIN_POOL_SIZE = 3
const DIFFICULTIES = ['easy', 'medium', 'hard', 'extreme']

/**
 * Manages the Sudoku solver Web Worker. It handles initializing the worker,
 * posting tasks to it (solving, generating, validating, pool filling),
 * and dispatching actions based on the worker's response.
 *
 * @param state - The current Sudoku state.
 * @param dispatch - The dispatch function from the Sudoku reducer.
 */
export function useSudokuSolver(state: SudokuState, dispatch: Dispatch<SudokuAction>) {
  const workerRef = useRef<Worker | null>(null)
  const { isSolving, isGenerating, isValidating, generationDifficulty } = state.solver
  const { board, puzzlePool, poolRequestCount } = state

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
  }, [])

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
        // Note: Errors during background pool generation are logged but don't show a UI error
        // as they are not user-initiated blocking actions.
      }
      if (isSolving || isGenerating || isValidating) {
        toast.error(`Operation failed: ${error}`)
      }
    }

    const handleWorkerMessage = (
      event: MessageEvent<{
        type: 'solution' | 'puzzle_generated' | 'validation_result' | 'error'
        result?: SolveResult
        puzzleString?: string
        solutionString?: string
        isValid?: boolean
        error?: string
        difficulty?: string // echoed back for generation results
        source?: 'user' | 'pool' // echoed back to distinguish request type
      }>,
    ) => {
      const { type, result, puzzleString, solutionString, isValid, error, difficulty, source } =
        event.data

      if (type === 'solution' && result) {
        dispatch(solveSuccess(result))
        toast.success('Sudoku solved successfully!')
      } else if (type === 'puzzle_generated' && puzzleString && solutionString && difficulty) {
        if (source === 'user') {
          dispatch(generatePuzzleSuccess(puzzleString, solutionString))
          toast.success('New puzzle generated!')
        } else if (source === 'pool') {
          // Quietly add to pool without interrupting user
          dispatch(poolRefillSuccess(difficulty, puzzleString, solutionString))
        }
      } else if (type === 'validation_result') {
        if (isValid && solutionString) {
          dispatch(validatePuzzleSuccess(solutionString))
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

  // Effect to trigger explicit user actions (Solve, Generate, Validate)
  useEffect(() => {
    // If no active user action, skip
    if (!isSolving && !isGenerating && !isValidating) return

    // If worker failed to initialize, fail gracefully
    if (!workerRef.current) {
      if (isSolving) dispatch(solveFailure())
      if (isGenerating) dispatch(generatePuzzleFailure())
      if (isValidating) dispatch(validatePuzzleFailure(WORKER_UNAVAILABLE_ERROR))
      return
    }

    if (isSolving) {
      const boardString = board.map((cell) => cell.value ?? '.').join('')
      workerRef.current.postMessage({ type: 'solve', boardString })
    } else if (isGenerating && generationDifficulty) {
      // Fallback for when pool is empty: explicit user generation request
      workerRef.current.postMessage({
        type: 'generate',
        difficulty: generationDifficulty,
        source: 'user',
      })
    } else if (isValidating) {
      const boardString = board.map((cell) => cell.value ?? '.').join('')
      workerRef.current.postMessage({ type: 'validate', boardString })
    }
  }, [isSolving, isGenerating, isValidating, generationDifficulty, board, dispatch])

  // Effect to manage background pool replenishment
  useEffect(() => {
    if (!workerRef.current) return

    DIFFICULTIES.forEach((difficulty) => {
      const pool = puzzlePool[difficulty] || []
      const pending = poolRequestCount[difficulty] || 0

      if (pool.length + pending < MIN_POOL_SIZE) {
        // Dispatch action to increment pending count immediately
        dispatch(requestPoolRefill(difficulty))
        // Post background task to worker
        workerRef.current?.postMessage({
          type: 'generate',
          difficulty,
          source: 'pool',
        })
      }
    })
  }, [puzzlePool, poolRequestCount, dispatch])
}
