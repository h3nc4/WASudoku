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

import { Lock, LockOpen } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useSudokuState } from '@/context/sudoku.hooks'
import { canUseSticky } from '@/context/sudoku.selectors'
import { useSudokuActions } from '@/hooks/useSudokuActions'

/** Turns sticky numbers on and off, where a pad key locks a digit that each cell tap applies. */
export function StickyToggle() {
  const state = useSudokuState()
  const { toggleSticky } = useSudokuActions()
  const { sticky } = state.ui

  return (
    <Button
      variant={sticky ? 'default' : 'outline'}
      size="icon-lg"
      onClick={toggleSticky}
      disabled={!canUseSticky(state)}
      aria-pressed={sticky}
      aria-label="Sticky numbers"
      title="Sticky numbers"
      onMouseDown={(e) => e.preventDefault()}
    >
      {sticky ? <Lock /> : <LockOpen />}
    </Button>
  )
}
