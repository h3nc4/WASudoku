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

import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useSudokuState } from '@/context/sudoku.hooks'
import { isBusy } from '@/context/sudoku.selectors'
import { DIFFICULTIES, type Difficulty } from '@/context/sudoku.types'
import { cn, DIFFICULTY_LABELS } from '@/lib/utils'

interface DifficultyPickerProps {
  readonly onSelect: (difficulty: Difficulty) => void
  readonly className?: string
}

/** One button per difficulty, with a spinner on the one still generating. */
export function DifficultyPicker({ onSelect, className }: DifficultyPickerProps) {
  const state = useSudokuState()
  const { solver } = state
  const isDisabled = isBusy(state)

  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-5', className)}>
      {DIFFICULTIES.map((value) => {
        const level = DIFFICULTY_LABELS[value]
        const isGeneratingThis = solver.isGenerating && solver.generationDifficulty === value
        return (
          <Button
            key={level}
            variant="outline"
            disabled={isDisabled}
            onClick={() => onSelect(value)}
            className={cn(value === 'extreme' && 'col-span-2 sm:col-span-1')}
          >
            {isGeneratingThis && <Loader2 className="size-4 animate-spin" />}
            {level}
          </Button>
        )
      })}
    </div>
  )
}
