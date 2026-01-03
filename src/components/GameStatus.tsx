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

import { useSudokuState } from '@/context/sudoku.hooks'
import { cn } from '@/lib/utils'

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Displays the current game timer and mistake count.
 */
export function GameStatus() {
  const { game, solver } = useSudokuState()

  // Only show in playing mode
  if (solver.gameMode !== 'playing') {
    return null
  }

  const { timer, mistakes } = game
  const isLimitReached = mistakes >= 3

  return (
    <div className="flex w-full items-center justify-between text-sm font-medium text-gray-600 dark:text-gray-400">
      <div className="flex items-center gap-2">
        <span>Mistakes:</span>
        <span className={cn(isLimitReached && 'font-bold text-red-500')}>{mistakes}/3</span>
      </div>
      <div>{formatTime(timer)}</div>
    </div>
  )
}
