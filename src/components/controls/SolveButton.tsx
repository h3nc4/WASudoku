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

import { useMemo, useState, useEffect } from 'react'
import { BrainCircuit, X, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSudokuState } from '@/context/sudoku.hooks'
import { useSudokuActions } from '@/hooks/useSudokuActions'

/**
 * A button that triggers the Sudoku solver or exits visualization mode.
 * It derives its state and tooltip from the global context.
 */
export function SolveButton() {
  const { solver, derived } = useSudokuState()
  const { solve, exitVisualization, validatePuzzle } = useSudokuActions()

  const [isShowingSolvingState, setIsShowingSolvingState] = useState(false)

  const isSolveDisabled =
    solver.isSolving ||
    solver.isValidating ||
    derived.isBoardEmpty ||
    derived.isBoardFull ||
    derived.conflicts.size > 0 ||
    solver.solveFailed

  const solveButtonTitle = useMemo(() => {
    if (derived.conflicts.size > 0) return 'Cannot solve with conflicts.'
    if (derived.isBoardFull) return 'Board is already full.'
    if (derived.isBoardEmpty) return 'Board is empty.'
    if (solver.solveFailed) return 'Solving failed. Please change the board to try again.'
    return 'Solve the puzzle'
  }, [derived.isBoardEmpty, derived.isBoardFull, derived.conflicts.size, solver.solveFailed])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    if (solver.isSolving) {
      timer = setTimeout(() => {
        setIsShowingSolvingState(true)
      }, 500)
    }

    return () => {
      if (timer) {
        clearTimeout(timer)
      }
      setIsShowingSolvingState(false)
    }
  }, [solver.isSolving])

  if (solver.gameMode === 'visualizing') {
    return (
      <Button onClick={exitVisualization} className="flex-1" variant="destructive">
        <X className="mr-2 size-4" />
        Exit Visualization
      </Button>
    )
  }

  if (solver.gameMode === 'customInput') {
    return (
      <Button
        onClick={validatePuzzle}
        className="flex-1"
        disabled={derived.isBoardEmpty || solver.isValidating}
        title={derived.isBoardEmpty ? 'Board is empty.' : 'Start puzzle'}
      >
        {solver.isValidating ? (
          <>
            <BrainCircuit className="mr-2 size-4 animate-pulse" />
            Validating...
          </>
        ) : (
          <>
            <Play className="mr-2 size-4" />
            Start Puzzle
          </>
        )}
      </Button>
    )
  }

  return (
    <Button onClick={solve} className="flex-1" disabled={isSolveDisabled} title={solveButtonTitle}>
      {isShowingSolvingState ? (
        <>
          <BrainCircuit className="mr-2 size-4 animate-pulse" />
          Solving...
        </>
      ) : (
        'Solve Puzzle'
      )}
    </Button>
  )
}
