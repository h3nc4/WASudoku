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

import { type Dispatch, useEffect, useRef } from 'react'
import { toast } from 'sonner'

import {
  generatePuzzleFailure,
  generatePuzzleSuccess,
  hintFailure,
  hintSuccess,
  poolRefill,
  solveFailure,
  solveSuccess,
  validatePuzzleFailure,
  validatePuzzleSuccess,
} from '@/context/sudoku.actions'
import type { SudokuAction } from '@/context/sudoku.actions.types'
import { scheduleIdle } from '@/context/sudoku.persistence'
import type { SudokuState } from '@/context/sudoku.types'
import { PoolRefill } from '@/lib/pool-refill'
import { boardStateToString } from '@/lib/utils'
import { Lane, WorkerPool } from '@/lib/worker-pool'

/**
 * Runs the player's solver requests on the foreground worker and refills the puzzle pool.
 *
 * @param state - The current Sudoku state.
 * @param dispatch - The dispatch function from the Sudoku reducer.
 */
export function useSudokuSolver(state: SudokuState, dispatch: Dispatch<SudokuAction>) {
  const poolRef = useRef<WorkerPool | null>(null)
  const refillRef = useRef<PoolRefill | null>(null)
  const { isSolving, isGenerating, isValidating, isHinting, generationDifficulty } = state.solver
  const { board, puzzlePool } = state

  useEffect(() => {
    try {
      const pool = new WorkerPool()
      poolRef.current = pool
      refillRef.current = new PoolRefill({
        generate: (difficulty) => pool.runTask('generate', { difficulty }, Lane.BACKGROUND),
        store: (puzzles) => dispatch(poolRefill(puzzles)),
        schedule: scheduleIdle,
      })
    } catch (error) {
      console.error('Failed to initialize WorkerPool:', error)
    }

    return () => {
      refillRef.current?.dispose()
      refillRef.current = null
      poolRef.current?.terminate()
      poolRef.current = null
    }
  }, [dispatch])

  useEffect(() => {
    if (!isSolving || !poolRef.current) return

    const boardString = boardStateToString(board)
    poolRef.current
      .runTask('solve', { boardString })
      .then((result) => {
        dispatch(solveSuccess(result))
        toast.success('Solver finished. Step through its solution beside the board.')
      })
      .catch((error) => {
        console.error('Solve error:', error)
        dispatch(solveFailure())
        toast.error(`Operation failed: ${error.message}`)
      })
  }, [isSolving, board, dispatch])

  // A new game with an empty pool for its difficulty generates in the foreground.
  useEffect(() => {
    if (!isGenerating || !generationDifficulty || !poolRef.current) return

    poolRef.current
      .runTask('generate', { difficulty: generationDifficulty })
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

  useEffect(() => {
    if (!isValidating || !poolRef.current) return

    const boardString = boardStateToString(board)
    poolRef.current
      .runTask('validate', { boardString })
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

  // A hint solves the player's current board and keeps only the first step.
  useEffect(() => {
    if (!isHinting || !poolRef.current) return

    const boardString = boardStateToString(board)
    poolRef.current
      .runTask('solve', { boardString })
      .then((result) => {
        dispatch(hintSuccess(result))
      })
      .catch((error) => {
        console.error('Hint error:', error)
        dispatch(hintFailure())
      })
  }, [isHinting, board, dispatch])

  useEffect(() => {
    refillRef.current?.update(puzzlePool)
  }, [puzzlePool])
}
