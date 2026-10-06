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
import { useCallback, useEffect } from 'react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSudokuState } from '@/context/sudoku.hooks'
import { useSudokuActions } from '@/hooks/useSudokuActions'
import { getStepExplanation, getTechniqueName } from '@/lib/techniques'

/**
 * A panel that displays the step-by-step logical solution from the solver.
 * It allows the user to navigate through the steps and see the board state at each point.
 */
export function SolverStepsPanel() {
  const { solver } = useSudokuState()
  const { viewSolverStep } = useSudokuActions()
  const { steps, currentStepIndex } = solver

  const handleStepSelect = useCallback(
    (index: number) => {
      viewSolverStep(index)
    },
    [viewSolverStep],
  )

  // Stepping can open an item outside the list, scrolled here since scrollIntoView moves the page too.
  useEffect(() => {
    if (currentStepIndex === null || currentStepIndex === 0) return
    const item = document.getElementById(`solver-step-${currentStepIndex - 1}`)
    const viewport = item?.closest('[data-slot="scroll-area-viewport"]')
    if (!item || !viewport) return
    const itemRect = item.getBoundingClientRect()
    const viewRect = viewport.getBoundingClientRect()
    if (itemRect.top < viewRect.top) {
      viewport.scrollTop -= viewRect.top - itemRect.top
    } else if (itemRect.bottom > viewRect.bottom) {
      viewport.scrollTop += itemRect.bottom - viewRect.bottom
    }
  }, [currentStepIndex])

  const handleAccordionChange = (value: string) => {
    // Only dispatch when an item is opened, not when closed (value is empty string).
    if (value) {
      // Dispatch `stepIndex + 1` because `viewSolverStep(N)` applies N steps.
      handleStepSelect(Number.parseInt(value, 10) + 1)
    }
  }

  if (steps.length === 0) {
    return null
  }

  // `currentStepIndex` is 1-based for steps, 0 for initial state.
  // The accordion's active item value is the 0-based step index.
  const activeAccordionItem =
    currentStepIndex !== null && currentStepIndex > 0 ? (currentStepIndex - 1).toString() : ''

  return (
    <div className="bg-card text-card-foreground flex h-full flex-col gap-2 rounded-lg border p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Solving Steps</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => handleStepSelect((currentStepIndex ?? 0) - 1)}
            disabled={currentStepIndex === null || currentStepIndex <= 0}
            title="Previous step (Left arrow)"
            aria-label="Previous step"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => handleStepSelect((currentStepIndex ?? 0) + 1)}
            disabled={currentStepIndex === null || currentStepIndex >= steps.length}
            title="Next step (Right arrow)"
            aria-label="Next step"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <Button
        variant={currentStepIndex === 0 ? 'secondary' : 'ghost'}
        data-state={currentStepIndex === 0 ? 'active' : 'inactive'}
        size="sm"
        onClick={() => handleStepSelect(0)}
      >
        Initial Board State
      </Button>
      <ScrollArea className="flex-1 overflow-auto">
        <Accordion
          type="single"
          collapsible
          value={activeAccordionItem}
          onValueChange={handleAccordionChange}
          className="pr-4"
        >
          {steps.map((step, index) => (
            <AccordionItem
              key={`step-${index}-${step.technique}`}
              id={`solver-step-${index}`}
              value={index.toString()}
            >
              <AccordionTrigger>
                Step {index + 1}: {getTechniqueName(step.technique)}
              </AccordionTrigger>
              <AccordionContent>{getStepExplanation(step)}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </ScrollArea>
      <Button
        variant={currentStepIndex === steps.length ? 'secondary' : 'ghost'}
        data-state={currentStepIndex === steps.length ? 'active' : 'inactive'}
        size="sm"
        onClick={() => handleStepSelect(steps.length)}
      >
        Solution
      </Button>
    </div>
  )
}
