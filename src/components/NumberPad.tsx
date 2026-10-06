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

import { memo, useCallback, useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { useSudokuState } from '@/context/sudoku.hooks'
import { useSudokuActions } from '@/hooks/useSudokuActions'
import { cn } from '@/lib/utils'

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

/**
 * An on-screen number pad for touch-friendly input. It displays a counter
 * for each number, indicating how many are left to be placed.
 */
export const NumberPad = memo(function NumberPad() {
  const { board, solver, ui } = useSudokuState()
  const { inputValue, setHighlightedValue } = useSudokuActions()

  const numberCounts = useMemo(() => {
    const counts = new Array(10).fill(0)
    for (const cell of board) {
      if (cell.value !== null) {
        counts[cell.value]++
      }
    }
    return counts
  }, [board])

  const handleNumberClick = useCallback(
    (value: number) => {
      // Always highlight the number that was tapped
      setHighlightedValue(value)
      // The inputValue action already knows whether a cell is active
      inputValue(value)
    },
    [inputValue, setHighlightedValue],
  )

  return (
    <div className="grid grid-cols-9 gap-1" aria-label="On-screen number pad">
      {NUMBERS.map((num) => {
        const remaining = 9 - numberCounts[num]
        const isComplete = remaining <= 0

        return (
          <Button
            key={`pad-${num}`}
            variant="outline"
            size="icon"
            data-complete={isComplete || undefined}
            className="aspect-[1/1.12] h-auto w-full rounded-[4px] data-[complete]:border-dashed data-[complete]:border-current/20 data-[complete]:bg-transparent data-[complete]:opacity-100"
            onClick={() => handleNumberClick(num)}
            disabled={isComplete || solver.gameMode === 'visualizing' || ui.isPaused}
            aria-label={`Enter number ${num}`}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="flex size-full flex-col items-center justify-center gap-0.5 md:gap-1">
              <span
                className={cn(
                  'voice-ink text-xl leading-none md:text-2xl',
                  isComplete ? 'text-note/50' : 'text-ink',
                )}
              >
                {num}
              </span>
              {!isComplete && (
                <span className="voice-mono text-muted-foreground text-[10px] leading-none tabular-nums md:text-xs">
                  {remaining}
                </span>
              )}
            </div>
          </Button>
        )
      })}
    </div>
  )
})
