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

import { PartyPopper } from 'lucide-react'
import { useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSudokuState } from '@/context/sudoku.hooks'
import { useSudokuActions } from '@/hooks/useSudokuActions'
import { DIFFICULTY_LABELS, formatTime } from '@/lib/utils'

import { DifficultyPicker } from './DifficultyPicker'

/** Congratulates the player on a finished board and offers the next puzzle. */
export function WinDialog() {
  const { solver, game, ui } = useSudokuState()
  const { generatePuzzle } = useSudokuActions()

  const isWon = solver.gameMode === 'playing' && solver.isSolved
  const [isDismissed, setIsDismissed] = useState(false)
  const [wasWon, setWasWon] = useState(isWon)

  // Each new win reopens the dialog, adjusted during render rather than in an effect.
  if (isWon !== wasWon) {
    setWasWon(isWon)
    setIsDismissed(false)
  }

  const difficulty = solver.difficulty ? DIFFICULTY_LABELS[solver.difficulty] : 'Custom'
  const mistakeText = game.mistakes === 1 ? '1 mistake' : `${game.mistakes} mistakes`

  return (
    <Dialog
      open={isWon && !isDismissed && ui.pendingPuzzle === null}
      onOpenChange={(open) => setIsDismissed(!open)}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PartyPopper className="text-ink size-5" />
            Puzzle solved
          </DialogTitle>
          <DialogDescription>
            {difficulty} puzzle finished in {formatTime(game.timer)} with {mistakeText}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <p className="voice-mono text-muted-foreground text-xs tracking-wider uppercase">
            Play another
          </p>
          <DifficultyPicker onSelect={generatePuzzle} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
