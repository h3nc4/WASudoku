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
import { Eraser } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSudokuState } from '@/context/sudoku.hooks'
import { useSudokuActions } from '@/hooks/useSudokuActions'
import { toast } from 'sonner'
import { cn, areBoardsEqual } from '@/lib/utils'

interface ClearButtonProps {
  readonly className?: string
}

/**
 * A button to clear the board. In 'playing' mode, it clears user progress.
 * In 'customInput' mode, it clears all numbers. It is disabled in other modes.
 */
export function ClearButton({ className }: ClearButtonProps) {
  const { solver, derived, board, initialBoard } = useSudokuState()
  const { clearBoard } = useSudokuActions()

  const isPristineInPlay = solver.gameMode === 'playing' && areBoardsEqual(board, initialBoard)
  const isEmptyInCustom = solver.gameMode === 'customInput' && derived.isBoardEmpty

  const isClearDisabled =
    solver.isSolving ||
    solver.isValidating ||
    !['playing', 'customInput'].includes(solver.gameMode) ||
    isPristineInPlay ||
    isEmptyInCustom

  const clearButtonTitle = useMemo(() => {
    if (isPristineInPlay) return 'No progress to clear.'
    if (isEmptyInCustom) return 'Board is already empty.'
    if (solver.gameMode === 'playing') return 'Clear your progress and reset the puzzle.'
    return 'Clear all numbers from the board.'
  }, [isPristineInPlay, isEmptyInCustom, solver.gameMode])

  const handleClear = () => {
    clearBoard()
    toast.info('Board cleared.')
  }

  return (
    <Button
      variant="secondary"
      onClick={handleClear}
      className={cn('w-full', className)}
      disabled={isClearDisabled}
      title={clearButtonTitle}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Eraser className="mr-2 size-4" />
      Clear Board
    </Button>
  )
}
