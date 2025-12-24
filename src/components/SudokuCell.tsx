/*
 * Copyright (C) 2025  Henrique Almeida
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

import { Input } from '@/components/ui/input'
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
}

/**
 * Computes the conditional class names for a cell's background.
 * @returns A string of Tailwind classes.
 */
const getBackgroundStyles = ({
  isConflict,
  isError,
  isActive,
  isSolving,
  isCause,
  isPlaced,
  isNumberHighlighted,
  isHighlighted,
  isTransientConflict,
}: Pick<
  SudokuCellProps,
  | 'isConflict'
  | 'isError'
  | 'isActive'
  | 'isSolving'
  | 'isCause'
  | 'isPlaced'
  | 'isNumberHighlighted'
  | 'isHighlighted'
  | 'isTransientConflict'
>) => {
  if (isTransientConflict) return '!bg-destructive/30 transition-colors duration-200'
  if (isConflict || isError) return '!bg-destructive/20'
  if (isActive) return 'bg-blue-100 dark:bg-sky-800/80'
  if (isSolving) return 'cursor-not-allowed bg-muted/50'
  if (isCause) return 'bg-purple-100 dark:bg-purple-800/80'
  if (isPlaced) return 'bg-green-100 dark:bg-green-900/80'
  if (isNumberHighlighted) return 'bg-blue-100 dark:bg-sky-900/80'
  if (isHighlighted) return 'bg-blue-50 dark:bg-sky-900/60'
  return ''
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
  isNumberHighlighted,
  isPlaced,
  isTransientConflict,
}: Pick<
  SudokuCellProps,
  | 'cell'
  | 'isConflict'
  | 'isError'
  | 'isGiven'
  | 'isSolved'
  | 'isNumberHighlighted'
  | 'isPlaced'
  | 'isTransientConflict'
> & {
  hasPencilMarks: boolean
}) => {
  const isSolverResult = isSolved && !isGiven
  const isUserInput = cell.value !== null && !isGiven && !isSolved && !isPlaced
  return cn({
    'text-transparent': hasPencilMarks && cell.value === null,
    'text-xl md:text-2xl': !(hasPencilMarks && cell.value === null),
    'text-primary font-bold': isGiven,
    'text-green-600 dark:text-green-400 font-bold': isPlaced,
    'font-bold text-blue-700 dark:text-blue-300': isNumberHighlighted && !isGiven && !isPlaced,
    'text-blue-600 dark:text-blue-400': isUserInput,
    'text-sky-600 dark:text-sky-400': isSolverResult,
    '!text-destructive': isConflict || isError || isTransientConflict,
  })
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
    <div className="relative">
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

      <Input
        ref={ref}
        id={`cell-${index}`}
        type="tel"
        readOnly
        value={cell.value === null ? '' : String(cell.value)}
        onFocus={handleFocus}
        className={cn(
          'border-border absolute inset-0 z-10 aspect-square size-full rounded-none bg-transparent p-0 text-center font-semibold transition-colors duration-200',
          'focus:z-20 focus:shadow-inner',
          'caret-transparent',
          col % 3 === 2 && col !== 8 && 'border-r-primary border-r-2',
          row % 3 === 2 && row !== 8 && 'border-b-primary border-b-2',
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
