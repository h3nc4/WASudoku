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
  poolRefillFailure,
} from '@/context/sudoku.actions'
import { WorkerPool, Priority } from '@/lib/worker-pool'
import { boardStateToString } from '@/lib/utils'

const MIN_POOL_SIZE = 3
const DIFFICULTIES = ['easy', 'medium', 'hard', 'extreme']

/**
 * Manages the Sudoku solver using a multi-threaded Worker Pool.
 * It schedules tasks (solve, generate, validate) and handles their results asynchronously.
 *
 * @param state - The current Sudoku state.
 * @param dispatch - The dispatch function from the Sudoku reducer.
 */
export function useSudokuSolver(state: SudokuState, dispatch: Dispatch<SudokuAction>) {
  const poolRef = useRef<WorkerPool | null>(null)
  const { isSolving, isGenerating, isValidating, generationDifficulty } = state.solver
  const { board, puzzlePool, poolRequestCount } = state

  // Initialize Worker Pool
  useEffect(() => {
    try {
      poolRef.current = new WorkerPool()
    } catch (error) {
      console.error('Failed to initialize WorkerPool:', error)
    }

    return () => {
      poolRef.current?.terminate()
      poolRef.current = null
    }
  }, [])

  // 1. Handle Solving (High Priority)
  useEffect(() => {
    if (!isSolving || !poolRef.current) return

    const boardString = boardStateToString(board)
    poolRef.current
      .runTask<SolveResult>('solve', { boardString }, Priority.HIGH)
      .then((result) => {
        dispatch(solveSuccess(result))
        toast.success('Sudoku solved successfully!')
      })
      .catch((error) => {
        console.error('Solve error:', error)
        dispatch(solveFailure())
        toast.error(`Operation failed: ${error.message}`)
      })
  }, [isSolving, board, dispatch])

  // 2. Handle User Generation (High Priority - Fallback when pool empty)
  useEffect(() => {
    if (!isGenerating || !generationDifficulty || !poolRef.current) return

    poolRef.current
      .runTask<{ puzzleString: string; solutionString: string }>(
        'generate',
        { difficulty: generationDifficulty },
        Priority.HIGH,
      )
      .then(({ puzzleString, solutionString }) => {
        dispatch(generatePuzzleSuccess(puzzleString, solutionString))
        toast.success('New puzzle generated!')
      })
      .catch((error) => {
        console.error('Generation error:', error)
        dispatch(generatePuzzleFailure())
        toast.error(`Operation failed: ${error.message}`)
      })
  }, [isGenerating, generationDifficulty, dispatch])

  // 3. Handle Validation (High Priority)
  useEffect(() => {
    if (!isValidating || !poolRef.current) return

    const boardString = boardStateToString(board)
    poolRef.current
      .runTask<{ isValid: boolean; solutionString: string }>(
        'validate',
        { boardString },
        Priority.HIGH,
      )
      .then(({ isValid, solutionString }) => {
        if (isValid && solutionString) {
          dispatch(validatePuzzleSuccess(solutionString))
          toast.success('Puzzle is valid and has a unique solution.')
        } else {
          dispatch(validatePuzzleFailure('Puzzle is invalid or does not have a unique solution.'))
        }
      })
      .catch((error) => {
        console.error('Validation error:', error)
        dispatch(validatePuzzleFailure(error.message))
        toast.error(`Operation failed: ${error.message}`)
      })
  }, [isValidating, board, dispatch])

  // 4. Handle Background Pool Refill (Low Priority)
  useEffect(() => {
    if (!poolRef.current) return

    DIFFICULTIES.forEach((difficulty) => {
      const pool = puzzlePool[difficulty] || []
      const pending = poolRequestCount[difficulty] || 0

      if (pool.length + pending < MIN_POOL_SIZE) {
        // Optimistically increment pending count
        dispatch(requestPoolRefill(difficulty))

        poolRef.current
          ?.runTask<{ puzzleString: string; solutionString: string }>(
            'generate',
            { difficulty },
            Priority.LOW,
          )
          .then(({ puzzleString, solutionString }) => {
            dispatch(poolRefillSuccess(difficulty, puzzleString, solutionString))
          })
          .catch((error) => {
            console.error(`Background refill failed for ${difficulty}:`, error)
            dispatch(poolRefillFailure(difficulty))
          })
      }
    })
  }, [puzzlePool, poolRequestCount, dispatch])
}
