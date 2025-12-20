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

import { Pencil } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useSudokuState } from '@/context/sudoku.hooks'
import { useSudokuActions } from '@/hooks/useSudokuActions'

/**
 * A button to automatically calculate and fill candidates for all empty cells.
 * It is only available in 'playing' mode.
 */
export function AutoFillButton() {
  const { solver, derived } = useSudokuState()
  const { autoFillCandidates } = useSudokuActions()

  const isDisabled =
    solver.gameMode !== 'playing' ||
    solver.isSolving ||
    solver.isValidating ||
    derived.isBoardEmpty ||
    derived.isBoardFull

  const handleAutoFill = () => {
    autoFillCandidates()
    toast.info('Candidates auto-filled.')
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleAutoFill}
      disabled={isDisabled}
      title="Auto-fill pencil marks"
      onMouseDown={(e) => e.preventDefault()}
    >
      <Pencil />
    </Button>
  )
}
