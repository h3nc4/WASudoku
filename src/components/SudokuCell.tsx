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

import { forwardRef, memo } from 'react'

import type { CellState } from '@/context/sudoku.types'
import { cn } from '@/lib/utils'

import { PencilMarks } from './PencilMarks'

interface SudokuCellProps {
  /** The state of the cell, including value and pencil marks. */
  readonly cell: CellState
  /** The index of the cell in the board array (0-80). */
  readonly index: number
  /** Whether the cell was part of the initial puzzle. */
  readonly isGiven: boolean
  /** Whether the solver is currently running. */
  readonly isSolving: boolean
  /** Whether the board is in a solved state. */
  readonly isSolved: boolean
  /** Whether this cell has a conflicting value based on peers. */
  readonly isConflict: boolean
  /** Whether this cell has a value that mismatches the final solution. */
  readonly isError?: boolean
  /** Whether this is the currently active/focused cell. */
  readonly isActive: boolean
  /** Whether this cell should be highlighted as part of the active row/column/box. */
  readonly isHighlighted: boolean
  /** Whether this cell's number matches the globally highlighted number. */
  readonly isNumberHighlighted: boolean
  /** For visualization, whether this cell is part of the "cause" of the logical step. */
  readonly isCause: boolean
  /** For visualization, whether this cell is the one being placed in the current step. */
  readonly isPlaced: boolean
  /** Callback function when the cell receives focus (e.g., via click). */
  readonly onFocus: (index: number) => void
  /** For visualization, a set of candidates eliminated in the current step. */
  readonly eliminatedCandidates?: ReadonlySet<number>
  /** Whether this cell is part of a momentary conflict highlight. */
  readonly isTransientConflict?: boolean
  /** Whether a hint points at this cell. */
  readonly isHintTarget?: boolean
}

/**
 * Computes the conditional class names for a cell's background.
 * @returns A string of Tailwind classes.
 */
const getBackgroundStyles = ({
  isActive,
  isSolving,
  isCause,
  isNumberHighlighted,
  isHighlighted,
  isHintTarget,
}: Pick<
  SudokuCellProps,
  'isActive' | 'isSolving' | 'isCause' | 'isNumberHighlighted' | 'isHighlighted' | 'isHintTarget'
>) => {
  let fill = ''
  if (isHintTarget) fill = 'solver-hatch'
  else if (isActive) fill = 'highlighter'
  else if (isNumberHighlighted) fill = 'bg-same'
  else if (isHighlighted) fill = 'bg-peer'

  let ring = ''
  if (isHintTarget) ring = 'ring-2 ring-inset ring-solver'
  else if (isCause) ring = 'ring-[1.5px] ring-inset ring-solver'

  return cn(fill, ring, isSolving && 'cursor-not-allowed')
}

/**
 * Computes the conditional class names for the cell's main input text.
 * @returns A string of Tailwind classes.
 */
const getInputTextStyles = ({
  cell,
  hasPencilMarks,
  isConflict,
  isError,
  isGiven,
  isSolved,
  isPlaced,
  isTransientConflict,
  isNumberHighlighted,
}: Pick<
  SudokuCellProps,
  | 'cell'
  | 'isConflict'
  | 'isError'
  | 'isGiven'
  | 'isSolved'
  | 'isPlaced'
  | 'isTransientConflict'
  | 'isNumberHighlighted'
> & {
  hasPencilMarks: boolean
}) => {
  if (hasPencilMarks && cell.value === null) return 'text-transparent'

  // Givens and walkthrough placements are inked, solver output speaks in mono, the rest is pencil.
  let voice = 'voice-pencil'
  if (isGiven || isPlaced) voice = 'voice-ink'
  else if (isSolved) voice = 'voice-mono'

  let color = 'text-pencil'
  if (isConflict || isError || isTransientConflict) color = 'text-error'
  else if (isPlaced) color = 'text-solver'
  else if (isGiven) color = 'text-ink'

  // Same-number digits go bold, which shows the state in letterform and makes 20px count as large text.
  let weight = ''
  if (isNumberHighlighted) weight = voice === 'voice-ink' ? 'font-extrabold' : 'font-bold'

  return cn(
    'text-xl md:text-2xl',
    voice,
    weight,
    color,
    (isConflict || isError) && 'underline decoration-error decoration-wavy decoration-[1.5px]',
    isTransientConflict && !(isConflict || isError) && 'underline decoration-error decoration-2',
  )
}

/**
 * Renders a single cell within the Sudoku grid.
 * This is a controlled component where all user input is handled by the parent grid.
 * It receives a ref to allow the parent to manage focus.
 */
const SudokuCell = forwardRef<HTMLInputElement, SudokuCellProps>((props, ref) => {
  const { cell, index, onFocus, eliminatedCandidates, ...styleProps } = props
  const handleFocus = () => onFocus(index)

  const row = Math.floor(index / 9)
  const col = index % 9

  const hasPencilMarks = cell.candidates.size > 0 || cell.centers.size > 0

  const backgroundClasses = getBackgroundStyles(styleProps)
  const textClasses = getInputTextStyles({
    ...styleProps,
    cell,
    hasPencilMarks,
  })

  return (
    <div
      className={cn(
        'relative',
        col !== 8 &&
          (col % 3 === 2 ? 'border-r-grid-thick border-r-2' : 'border-r-grid-thin border-r'),
        row !== 8 &&
          (row % 3 === 2 ? 'border-b-grid-thick border-b-2' : 'border-b-grid-thin border-b'),
      )}
    >
      <div
        data-testid="cell-background"
        className={cn(
          'pointer-events-none absolute inset-0 z-0 flex size-full items-center justify-center',
          backgroundClasses,
        )}
      >
        {cell.value === null && (
          <PencilMarks
            candidates={cell.candidates}
            centers={cell.centers}
            eliminations={eliminatedCandidates}
          />
        )}
      </div>

      {/* A bare input keeps focus and the accessible name without looking like a form field. */}
      <input
        ref={ref}
        id={`cell-${index}`}
        type="tel"
        readOnly
        value={cell.value === null ? '' : String(cell.value)}
        onFocus={handleFocus}
        className={cn(
          'absolute inset-0 z-10 size-full appearance-none rounded-none border-0 bg-transparent p-0 text-center leading-none underline-offset-4 caret-transparent transition-colors duration-200 outline-none',
          'focus:z-20 focus-visible:ring-2 focus-visible:ring-inset',
          props.isHintTarget
            ? 'ring-solver focus-visible:ring-solver'
            : 'ring-ink focus-visible:ring-ink',
          props.isActive && 'ring-2 ring-inset',
          textClasses,
        )}
        aria-label={`Sudoku cell at row ${row + 1}, column ${col + 1}`}
        aria-invalid={props.isConflict || props.isError}
      />
    </div>
  )
})

SudokuCell.displayName = 'SudokuCell'
export default memo(SudokuCell)
