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

import { Play } from 'lucide-react'
import {
  type ClipboardEvent,
  createRef,
  type FocusEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
} from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { importBoard } from '@/context/sudoku.actions'
import { useSudokuDispatch, useSudokuState } from '@/context/sudoku.hooks'
import { isEditable, isGridReadOnly, isWrongValue } from '@/context/sudoku.selectors'
import type { CellState } from '@/context/sudoku.types'
import { useBoardMove } from '@/hooks/useBoardMove'
import { useSudokuActions } from '@/hooks/useSudokuActions'
import { cn, getRelatedCellIndices, isBoardStringValid } from '@/lib/utils'

import SudokuCell from './SudokuCell'

/**
 * Renders the 9x9 Sudoku grid container and manages all keyboard interactions.
 * It orchestrates focus management and dispatches actions for cell changes.
 */
export function SudokuGrid() {
  const state = useSudokuState()
  const { board, ui, solver, derived } = state
  const dispatch = useSudokuDispatch()
  const actions = useSudokuActions()

  const displayBoard = solver.gameMode === 'visualizing' ? solver.visualizationBoard : board
  const isReadOnly = isGridReadOnly(state)
  const isPasteAllowed = isEditable(state)
  const boardMove = useBoardMove(board)
  const move = solver.gameMode === 'visualizing' ? null : boardMove

  const cellRefs = useMemo(
    () => Array.from({ length: 81 }, () => createRef<HTMLInputElement>()),
    [],
  )

  const highlightedIndices = useMemo(() => {
    if (ui.activeCellIndex === null) {
      return new Set<number>()
    }
    return getRelatedCellIndices(ui.activeCellIndex)
  }, [ui.activeCellIndex])

  const causeIndices = useMemo(() => {
    if (
      solver.gameMode !== 'visualizing' ||
      solver.currentStepIndex === null ||
      solver.currentStepIndex === 0
    ) {
      return new Set<number>()
    }
    const currentStep = solver.steps[solver.currentStepIndex - 1]
    if (!currentStep?.cause) {
      return new Set<number>()
    }
    return new Set(currentStep.cause.map((c) => c.index))
  }, [solver.gameMode, solver.currentStepIndex, solver.steps])

  const placedIndices = useMemo(() => {
    if (
      solver.gameMode !== 'visualizing' ||
      solver.currentStepIndex === null ||
      solver.currentStepIndex === 0
    ) {
      return new Set<number>()
    }
    const currentStep = solver.steps[solver.currentStepIndex - 1]
    const placements = currentStep?.placements ?? []
    return new Set(placements.map((p) => p.index))
  }, [solver.gameMode, solver.currentStepIndex, solver.steps])

  const hintIndices = useMemo(() => {
    const cause = new Set<number>()
    const target = new Set<number>()
    const hint = ui.hint
    if (solver.gameMode !== 'playing' || hint === null) return { cause, target }

    if (hint.kind === 'step') {
      hint.step.cause.forEach((c) => cause.add(c.index))
      // A placement is the news. Its incidental peer eliminations stay unmarked.
      const { placements, eliminations } = hint.step
      const targets = placements.length > 0 ? placements : eliminations
      targets.forEach((t) => target.add(t.index))
    } else {
      target.add(hint.index)
    }
    return { cause, target }
  }, [solver.gameMode, ui.hint])

  // Effect to declaratively manage focus based on the activeCellIndex state.
  useEffect(() => {
    if (ui.activeCellIndex !== null && cellRefs[ui.activeCellIndex]?.current) {
      cellRefs[ui.activeCellIndex].current?.focus()
    }
  }, [ui.activeCellIndex, cellRefs])

  const handleCellFocus = useCallback(
    (index: number) => {
      if (isReadOnly) return
      actions.setActiveCell(index)
    },
    [actions, isReadOnly],
  )

  // Reading the paste event's own data avoids the clipboard permission prompt.
  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      if (!isPasteAllowed) return
      const isPlaying = solver.gameMode === 'playing'
      event.preventDefault()
      const text = event.clipboardData.getData('text').replaceAll(/\s/g, '')
      if (!isBoardStringValid(text)) {
        toast.error('Invalid board format in clipboard.')
      } else if (isPlaying) {
        actions.offerPuzzle(text)
      } else {
        dispatch(importBoard(text))
        toast.success('Board imported from clipboard.')
      }
    },
    [actions, dispatch, isPasteAllowed, solver.gameMode],
  )

  // Centralized keyboard handler for the entire grid.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // Modified keys belong to the browser and to the global shortcuts, such as paste and undo.
      if (isReadOnly || e.ctrlKey || e.metaKey || e.altKey) return

      const key = e.key
      // Prevent default for handled keys to avoid scrolling.
      if (
        (key >= '0' && key <= '9') ||
        [
          'Backspace',
          'Delete',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          ' ',
          'n',
          'N',
        ].includes(key)
      ) {
        e.preventDefault()
      }

      if (key === ' ' || key === 'n' || key === 'N') {
        actions.cycleInputMode()
      } else if (key === '0') {
        actions.eraseActiveCell('delete')
      } else if (key >= '1' && key <= '9') {
        const value = Number.parseInt(key, 10)
        actions.inputValue(value)
        actions.setHighlightedValue(value)
      } else if (key === 'Backspace') {
        actions.eraseActiveCell('backspace')
      } else if (key === 'Delete') {
        actions.eraseActiveCell('delete')
      } else if (key === 'ArrowUp') {
        actions.navigate('up')
      } else if (key === 'ArrowDown') {
        actions.navigate('down')
      } else if (key === 'ArrowLeft') {
        actions.navigate('left')
      } else if (key === 'ArrowRight') {
        actions.navigate('right')
      }
    },
    [isReadOnly, actions],
  )

  // Effect to handle focus leaving the grid entirely.
  const handleGridBlur = useCallback(
    (e: FocusEvent<HTMLDivElement>) => {
      // If the element receiving focus is not a cell within this grid, deselect.
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        actions.setActiveCell(null)
      }
    },
    [actions],
  )

  const hintEliminations = useMemo(() => {
    if (solver.gameMode !== 'playing' || ui.hint?.kind !== 'step') return null
    const byCell = new Map<number, Set<number>>()
    for (const { index, value } of ui.hint.step.eliminations) {
      byCell.set(index, (byCell.get(index) ?? new Set()).add(value))
    }
    return byCell
  }, [solver.gameMode, ui.hint])

  if (!displayBoard) {
    return null
  }

  return (
    <div className="relative">
      <div
        role="grid"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onBlur={handleGridBlur}
        onPaste={handlePaste}
        aria-hidden={ui.isPaused || undefined}
        className={cn(
          'bg-paper border-grid-thick grid aspect-square grid-cols-9 overflow-hidden rounded-[3px] border-2 outline-none',
          ui.isPaused && 'invisible',
        )}
      >
        {displayBoard.map((currentCell, index) => {
          const isVisualizing = solver.gameMode === 'visualizing'

          const displayCell: CellState = isVisualizing
            ? {
                value: currentCell.value,
                isGiven: currentCell.isGiven,
                candidates: solver.candidatesForViz?.[index] ?? new Set(),
                centers: new Set(),
              }
            : currentCell

          const eliminatedCandidates = isVisualizing
            ? new Set(
                solver.eliminationsForViz?.filter((e) => e.index === index).map((e) => e.value),
              )
            : undefined

          const row = Math.floor(index / 9)
          const col = index % 9

          const isError = isWrongValue(state, index)

          return (
            <SudokuCell
              ref={cellRefs[index]}
              // For a static 9x9 grid, the row and column form a stable, unique key.
              key={`cell-r${row}-c${col}`}
              index={index}
              cell={displayCell}
              isGiven={displayCell.isGiven}
              isSolving={solver.isSolving}
              isSolved={solver.isSolved && isVisualizing}
              isConflict={derived.conflicts.has(index)}
              isError={isError}
              isActive={!solver.isSolved && ui.activeCellIndex === index}
              isHighlighted={!solver.isSolved && highlightedIndices.has(index)}
              isNumberHighlighted={
                !solver.isSolved &&
                displayCell.value !== null &&
                displayCell.value === ui.highlightedValue
              }
              isCause={causeIndices.has(index) || hintIndices.cause.has(index)}
              isPlaced={placedIndices.has(index)}
              isHintTarget={hintIndices.target.has(index)}
              onFocus={handleCellFocus}
              eliminatedCandidates={eliminatedCandidates ?? hintEliminations?.get(index)}
              isTransientConflict={ui.transientConflicts?.has(index) ?? false}
              animateEntry={move?.index === index}
              strikeRemovedNotes={
                move?.kind === 'place' && move.index !== index && move.touched.has(index)
              }
            />
          )
        })}
      </div>
      {ui.isPaused && (
        <div className="bg-paper border-grid-thick absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[3px] border-2">
          <p className="text-ink voice-ink text-2xl">Paused</p>
          <Button onClick={actions.resumeGame}>
            <Play className="mr-2 size-4" />
            Resume
          </Button>
        </div>
      )}
    </div>
  )
}
