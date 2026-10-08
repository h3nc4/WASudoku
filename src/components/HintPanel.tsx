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

import { X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { useSudokuState } from '@/context/sudoku.hooks'
import type { Hint } from '@/context/sudoku.types'
import { useSudokuActions } from '@/hooks/useSudokuActions'
import { getHintExplanation } from '@/lib/techniques'

import { StepEntry, TraceEntry } from './SolverTrace'

function HintEntry({ hint }: { readonly hint: Hint }) {
  switch (hint.kind) {
    case 'step':
      return <StepEntry tag="Hint" step={hint.step} withValue={false} />
    case 'mistake':
      return <TraceEntry tag="Hint" cells={[hint.index]} label="Check this cell" />
    case 'reveal':
      return <TraceEntry tag="Hint" cells={[hint.index]} label="Reveal" />
  }
}

/**
 * Explains the hint highlighted on the board. Editing the board dismisses it.
 * The strip opens below the board and keeps the last hint while it closes.
 */
export function HintPanel() {
  const { ui, solver } = useSudokuState()
  const { clearHint } = useSudokuActions()

  const current = solver.gameMode === 'playing' ? ui.hint : null
  const [shown, setShown] = useState<Hint | null>(current)
  if (current !== null && current !== shown) {
    setShown(current)
  }

  const isOpen = current !== null
  const hint = current ?? shown
  return (
    <div
      className="hint-slot"
      data-open={isOpen || undefined}
      aria-hidden={!isOpen || undefined}
      inert={!isOpen}
      onTransitionEnd={(e) => {
        if (!isOpen && e.target === e.currentTarget) setShown(null)
      }}
    >
      <div className="min-h-0 overflow-hidden">
        {hint !== null && (
          <div className="hint-slot-content pb-(--column-gap)">
            <output className="bg-paper border-grid-thin border-l-solver flex items-start gap-2 rounded-md border border-l-2 py-2 pr-1 pl-3">
              <div className="min-w-0 flex-1 py-0.5">
                <p className="voice-mono text-solver grid grid-cols-[auto_auto_1fr] gap-x-[1.5ch] text-xs font-semibold tabular-nums [&>span:first-child]:uppercase">
                  <HintEntry hint={hint} />
                </p>
                <p className="text-foreground mt-1 text-sm">{getHintExplanation(hint)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground size-7"
                onClick={clearHint}
                aria-label="Dismiss hint"
                onMouseDown={(e) => e.preventDefault()}
              >
                <X />
              </Button>
            </output>
          </div>
        )}
      </div>
    </div>
  )
}
