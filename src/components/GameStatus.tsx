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
import { cn, DIFFICULTY_LABELS, formatTime } from '@/lib/utils'

/** Displays the difficulty, timer and mistake count, with a pause control. */
export function GameStatus() {
  const { game, solver, ui } = useSudokuState()
  const { pauseGame, resumeGame } = useSudokuActions()

  // Only show in playing mode
  if (solver.gameMode !== 'playing') {
    return null
  }

  const { timer, mistakes } = game
  const isLimitReached = mistakes >= 3
  const difficulty = solver.difficulty ? DIFFICULTY_LABELS[solver.difficulty] : 'Custom'

  return (
    <div className="voice-mono text-muted-foreground bg-paper flex min-h-10 w-full items-center justify-between rounded-md px-3 text-sm tabular-nums">
      <div className="flex items-center gap-3">
        <span className="text-foreground">{difficulty}</span>
        <span className="flex items-center gap-1.5">
          <span>Mistakes:</span>
          <span className={cn(isLimitReached && 'text-error font-bold')}>{mistakes}/3</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        {solver.isSolved && <span className="text-ink font-bold">Solved</span>}
        <span className="text-foreground">{formatTime(timer)}</span>
        {!solver.isSolved && (
          <Button
            variant="ghost"
            size="icon-lg"
            className="-mr-3"
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
