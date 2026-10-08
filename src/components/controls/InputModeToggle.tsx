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

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useSudokuState } from '@/context/sudoku.hooks'
import type { InputMode } from '@/context/sudoku.types'
import { useSudokuActions } from '@/hooks/useSudokuActions'

/**
 * A segmented control for the Pen, Corner and Center input modes.
 */
export function InputModeToggle() {
  const { ui, solver } = useSudokuState()
  const { setInputMode } = useSudokuActions()

  const handleModeChange = (value: string) => {
    if (value) {
      setInputMode(value as InputMode)
    }
  }

  return (
    <ToggleGroup
      type="single"
      value={ui.inputMode}
      onValueChange={handleModeChange}
      className="w-full"
      aria-label="Input Mode"
      indicator
      disabled={solver.gameMode === 'visualizing'}
    >
      <ToggleGroupItem
        value="normal"
        className="h-11 flex-1 md:h-9"
        onMouseDown={(e) => e.preventDefault()}
      >
        Pen
      </ToggleGroupItem>
      <ToggleGroupItem
        value="candidate"
        className="h-11 flex-1 md:h-9"
        onMouseDown={(e) => e.preventDefault()}
      >
        Corner
      </ToggleGroupItem>
      <ToggleGroupItem
        value="center"
        className="h-11 flex-1 md:h-9"
        onMouseDown={(e) => e.preventDefault()}
      >
        Center
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
