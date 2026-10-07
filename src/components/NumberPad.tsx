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

import { memo, useCallback, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useSudokuState } from '@/context/sudoku.hooks'
import { isGridReadOnly } from '@/context/sudoku.selectors'
import type { BoardState } from '@/context/sudoku.types'
import { useSudokuActions } from '@/hooks/useSudokuActions'
import { cn } from '@/lib/utils'

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

interface StrikeMemory {
  readonly givens: string
  /** Digits seen with a count left in this puzzle, the only ones whose strike may draw in. */
  readonly seenOpen: readonly boolean[]
}

const givensOf = (board: BoardState) =>
  board.map((cell) => (cell.isGiven ? (cell.value ?? 0) : 0)).join('')

const remember = (counts: readonly number[], prev?: StrikeMemory): readonly boolean[] =>
  counts.map((count, digit) => count < 9 || (prev?.seenOpen[digit] ?? false))

/**
 * An on-screen number pad for touch-friendly input. It displays a counter
 * for each number, indicating how many are left to be placed.
 */
export const NumberPad = memo(function NumberPad() {
  const state = useSudokuState()
  const { board } = state
  const isReadOnly = isGridReadOnly(state)
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

  // A digit already complete when a puzzle loads strikes at once, so only a completion during play draws in.
  const givens = useMemo(() => givensOf(board), [board])
  const [strikes, setStrikes] = useState<StrikeMemory>(() => ({
    givens,
    seenOpen: remember(numberCounts),
  }))
  const samePuzzle = strikes.givens === givens
  const seenOpen = remember(numberCounts, samePuzzle ? strikes : undefined)
  if (!samePuzzle || seenOpen.some((open, digit) => open !== strikes.seenOpen[digit])) {
    setStrikes({ givens, seenOpen })
  }

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
        const isDisabled = isComplete || isReadOnly

        return (
          <Button
            key={`pad-${num}`}
            variant="outline"
            size="icon"
            data-complete={isComplete || undefined}
            className="aspect-[1/1.12] h-auto min-h-11 w-full rounded-[4px]"
            onClick={() => handleNumberClick(num)}
            disabled={isDisabled}
            aria-label={`Enter number ${num}`}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="flex size-full flex-col items-center justify-center gap-0.5 md:gap-1">
              {/* A used-up digit is struck out, so it reads as spent rather than unavailable. */}
              <span
                className={cn(
                  'voice-ink pad-strike text-xl leading-none md:text-2xl',
                  isDisabled ? 'text-disabled-foreground' : 'text-ink',
                )}
                data-struck={isComplete || undefined}
                data-armed={seenOpen[num] || undefined}
              >
                {num}
              </span>
              {!isComplete && (
                <span
                  className={cn(
                    'voice-mono text-[10px] leading-none tabular-nums md:text-xs',
                    isDisabled ? 'text-disabled-foreground' : 'text-muted-foreground',
                  )}
                >
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
