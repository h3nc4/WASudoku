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

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { type CSSProperties, useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSudokuState } from '@/context/sudoku.hooks'
import { useSudokuActions } from '@/hooks/useSudokuActions'
import { getStepExplanation, getTechniqueName } from '@/lib/techniques'
import { cn } from '@/lib/utils'

import { StepEntry } from './SolverTrace'

type Position = 'past' | 'current' | 'future'

const ROW_TONE: Record<Position, string> = {
  past: 'text-ink hover:bg-accent',
  current: 'text-solver bg-solver-wash font-semibold',
  future: 'text-note hover:bg-accent',
}

const REACHED_TONE = 'text-solver font-semibold hover:bg-accent'

const ROW_CLASS =
  'voice-mono grid w-full grid-cols-[var(--trace-tag)_8ch_1fr] gap-x-[1.5ch] rounded-sm px-2 py-1 text-left text-xs tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-ring'

const positionOf = (index: number, current: number | null): Position => {
  if (current === null || index > current) return 'future'
  return index === current ? 'current' : 'past'
}

/**
 * The solver's trace, one line per deduction, with the board following the selected line.
 * Position 0 is the initial board and position N is the board after N steps.
 */
export function SolverStepsPanel() {
  const { solver } = useSudokuState()
  const { viewSolverStep } = useSudokuActions()
  const { steps, currentStepIndex } = solver
  const logRef = useRef<HTMLOListElement>(null)

  // Stepping can select a line outside the log, scrolled here since scrollIntoView moves the page too.
  useEffect(() => {
    if (currentStepIndex === null) return
    const viewport = logRef.current?.closest('[data-slot="scroll-area-viewport"]')
    const item = document.getElementById(`solver-step-${currentStepIndex - 1}`)
    if (!viewport) return
    if (!item) {
      viewport.scrollTop = 0
      return
    }
    const itemRect = item.getBoundingClientRect()
    const viewRect = viewport.getBoundingClientRect()
    if (itemRect.top < viewRect.top) {
      viewport.scrollTop -= viewRect.top - itemRect.top
    } else if (itemRect.bottom > viewRect.bottom) {
      viewport.scrollTop += itemRect.bottom - viewRect.bottom
    }
  }, [currentStepIndex])

  if (steps.length === 0) {
    return null
  }

  const tagWidth = String(steps.length).length
  const tagOf = (position: number) => String(position).padStart(tagWidth, '0')

  const isSolution = currentStepIndex === steps.length
  const explanation =
    currentStepIndex === null || currentStepIndex === 0
      ? 'The puzzle as given. Step forward to replay each deduction on the board.'
      : getStepExplanation(steps[currentStepIndex - 1])

  // The solution shares its board with the last step, so the wash and the current mark stay on that step.
  const endRow = (position: number, label: string) => {
    const state = positionOf(position, currentStepIndex)
    const isLastStep = position > 0 && state === 'current'
    return (
      <button
        type="button"
        className={cn(ROW_CLASS, isLastStep ? REACHED_TONE : ROW_TONE[state])}
        data-state={state === 'current' ? 'active' : 'inactive'}
        aria-label={label}
        aria-current={state === 'current' && !isLastStep ? 'step' : undefined}
        onClick={() => viewSolverStep(position)}
      >
        <span>{position === 0 ? tagOf(0) : ''}</span> <span className="col-span-2">{label}</span>
      </button>
    )
  }

  return (
    <div
      className="bg-paper border-grid-thin flex h-full min-w-0 flex-col gap-2 rounded-md border p-3"
      style={{ '--trace-tag': `${tagWidth}ch` } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="voice-mono text-muted-foreground text-xs font-semibold tracking-[0.08em] uppercase">
          Solving Steps
        </h2>
        <div className="flex items-center gap-1">
          <span className="voice-mono text-muted-foreground mr-1 text-xs tabular-nums">
            {tagOf(currentStepIndex ?? 0)}/{steps.length}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7"
            onClick={() => viewSolverStep((currentStepIndex ?? 0) - 1)}
            disabled={currentStepIndex === null || currentStepIndex <= 0}
            title="Previous step (Left arrow)"
            aria-label="Previous step"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7"
            onClick={() => viewSolverStep((currentStepIndex ?? 0) + 1)}
            disabled={currentStepIndex === null || currentStepIndex >= steps.length}
            title="Next step (Right arrow)"
            aria-label="Next step"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="border-grid-thin flex min-h-0 flex-1 flex-col gap-1 border-t pt-2">
        {endRow(0, 'Initial Board State')}
        <ScrollArea className="min-h-0 flex-1">
          <ol ref={logRef} aria-label="Solver trace" className="pr-2.5">
            {steps.map((step, index) => {
              const state = positionOf(index + 1, currentStepIndex)
              const technique = getTechniqueName(step.technique)
              return (
                <li key={`step-${index}-${step.technique}`} id={`solver-step-${index}`}>
                  <button
                    type="button"
                    className={cn(ROW_CLASS, ROW_TONE[state])}
                    aria-label={`Step ${index + 1}: ${technique}`}
                    aria-current={state === 'current' ? 'step' : undefined}
                    onClick={() => state !== 'current' && viewSolverStep(index + 1)}
                  >
                    <StepEntry tag={tagOf(index + 1)} step={step} />
                  </button>
                </li>
              )
            })}
          </ol>
        </ScrollArea>
        {endRow(steps.length, 'Solution')}
      </div>
      <p
        aria-live="polite"
        className="border-grid-thin text-foreground h-36 shrink-0 overflow-y-auto border-t pt-2 text-sm leading-snug"
      >
        {explanation}
        {isSolution && (
          <span className="voice-mono text-solver mt-2 block text-xs font-semibold">
            Solved in {steps.length} {steps.length === 1 ? 'step' : 'steps'}
          </span>
        )}
      </p>
    </div>
  )
}
