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

import { BrainCircuit, Eye, Play, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useSudokuState } from '@/context/sudoku.hooks'
import { canSolve } from '@/context/sudoku.selectors'
import { useSudokuActions } from '@/hooks/useSudokuActions'

import { ConfirmDialog } from '../ConfirmDialog'

/** Triggers the solver or exits visualization. During play it asks first, as one tap spoils the game. */
export function SolveButton() {
  const state = useSudokuState()
  const { solver, derived } = state
  const { solve, exitVisualization, validatePuzzle } = useSudokuActions()

  const [isShowingSolvingState, setIsShowingSolvingState] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  const isSolveDisabled = !canSolve(state)

  const solveButtonTitle = useMemo(() => {
    if (derived.conflicts.size > 0) return 'Cannot solve with conflicts.'
    if (derived.isBoardFull) return 'Board is already full.'
    if (derived.isBoardEmpty) return 'Board is empty.'
    if (solver.solveFailed) return 'Solving failed. Please change the board to try again.'
    return 'Reveal the solution with every solving step'
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

  const handleSolve = () => {
    if (solver.gameMode === 'playing') {
      setIsConfirmOpen(true)
    } else {
      solve()
    }
  }

  if (solver.gameMode === 'visualizing') {
    return (
      <Button onClick={exitVisualization} size="lg" className="flex-1" variant="destructive">
        <X className="mr-2 size-4" />
        Exit Visualization
      </Button>
    )
  }

  if (solver.gameMode === 'customInput') {
    return (
      <Button
        onClick={validatePuzzle}
        size="lg"
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
    <>
      <Button
        onClick={handleSolve}
        variant="outline"
        size="lg"
        className="flex-1"
        disabled={isSolveDisabled}
        title={solveButtonTitle}
        onMouseDown={(e) => e.preventDefault()}
      >
        {isShowingSolvingState ? (
          <>
            <BrainCircuit className="mr-2 size-4 animate-pulse" />
            Solving...
          </>
        ) : (
          <>
            <Eye className="mr-2 size-4" />
            Solve
          </>
        )}
      </Button>
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title="Reveal the solution?"
        description="Every remaining cell is filled in and the solving steps open beside the board. Exit the walkthrough to return to this game."
        confirmLabel="Reveal solution"
        onConfirm={solve}
      />
    </>
  )
}
