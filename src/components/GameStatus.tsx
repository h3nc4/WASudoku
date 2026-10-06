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

import { Pause, Play } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useSudokuState } from '@/context/sudoku.hooks'
import { useSudokuActions } from '@/hooks/useSudokuActions'
import { cn, formatTime } from '@/lib/utils'

/** Displays the game timer and mistake count, with a pause control. */
export function GameStatus() {
  const { game, solver, ui } = useSudokuState()
  const { pauseGame, resumeGame } = useSudokuActions()

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
      <div className="flex items-center gap-2">
        {solver.isSolved && (
          <span className="font-semibold text-green-600 dark:text-green-400">Solved</span>
        )}
        <span>{formatTime(timer)}</span>
        {!solver.isSolved && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={ui.isPaused ? resumeGame : pauseGame}
            aria-label={ui.isPaused ? 'Resume game' : 'Pause game'}
            title={ui.isPaused ? 'Resume game' : 'Pause game'}
            onMouseDown={(e) => e.preventDefault()}
          >
            {ui.isPaused ? <Play /> : <Pause />}
          </Button>
        )}
      </div>
    </div>
  )
}
