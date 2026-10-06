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

import { Lightbulb, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useSudokuState } from '@/context/sudoku.hooks'
import { useSudokuActions } from '@/hooks/useSudokuActions'
import { getHintExplanation, getTechniqueName } from '@/lib/techniques'

/** Explains the hint highlighted on the board. Editing the board dismisses it. */
export function HintPanel() {
  const { ui, solver } = useSudokuState()
  const { clearHint } = useSudokuActions()

  if (solver.gameMode !== 'playing' || ui.hint === null) {
    return null
  }

  const { hint } = ui
  let title = 'Hint'
  if (hint.kind === 'mistake') title = 'Check this cell'
  else if (hint.kind === 'step') title = getTechniqueName(hint.step.technique)

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-50 p-3 text-sm dark:bg-amber-950/40"
    >
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground">{getHintExplanation(hint)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={clearHint}
        aria-label="Dismiss hint"
        onMouseDown={(e) => e.preventDefault()}
      >
        <X />
      </Button>
    </div>
  )
}
