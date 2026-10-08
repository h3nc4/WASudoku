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

import { type CSSProperties, forwardRef, memo } from 'react'

import type { CellState } from '@/context/sudoku.types'
import type { BoardMoment } from '@/hooks/useBoardMove'
import { cn } from '@/lib/utils'

import { type MarkMotion, PencilMarks } from './PencilMarks'

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
  /** A pointer tap, kept apart from focus, which arrow keys move too. */
  readonly onTap?: (index: number) => void
  /** For visualization, a set of candidates eliminated in the current step. */
  readonly eliminatedCandidates?: ReadonlySet<number>
  /** Whether this cell is part of a momentary conflict highlight. */
  readonly isTransientConflict?: boolean
  /** The clash count, whose parity picks the keyframes so a repeat clash replays the pulse. */
  readonly conflictPulse?: number
  /** Whether a hint points at this cell. */
  readonly isHintTarget?: boolean
  /** Whether the player just changed this cell. A new digit then inks in and toggled notes fade. */
  readonly animateEntry?: boolean
  /** Whether a placement elsewhere just removed notes here, which strike out before leaving. */
  readonly strikeRemovedNotes?: boolean
  /** A one-shot board moment playing on this cell, drawn on its own layer above the fill. */
  readonly moment?: BoardMoment['kind']
  /** When this cell's part of the moment starts, in milliseconds. */
  readonly momentDelay?: number
  /** Changes per moment, so the layer remounts and its animation replays. */
  readonly momentKey?: number
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
  isPlaced,
}: Pick<
  SudokuCellProps,
  | 'isActive'
  | 'isSolving'
  | 'isCause'
  | 'isNumberHighlighted'
  | 'isHighlighted'
  | 'isHintTarget'
  | 'isPlaced'
>) => {
  let fill = ''
  if (isHintTarget) fill = 'solver-hatch'
  // A walkthrough placement gets a lit cell, since amber digits alone read close to grey on light paper.
  else if (isPlaced) fill = 'bg-solver-wash'
  else if (isActive) fill = 'highlighter'
  else if (isNumberHighlighted) fill = 'bg-same'
  else if (isHighlighted) fill = 'bg-peer'

  let ring = ''
  if (isHintTarget) ring = 'ring-2 ring-inset ring-solver'
  else if (isCause) ring = 'ring-[1.5px] ring-inset ring-solver'

  return cn('cell-fill', fill, ring, (fill || ring) && 'cell-on', isSolving && 'cursor-not-allowed')
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Computes the conditional class names for the cell's digit.
 * @returns A string of Tailwind classes.
 */
const getInputTextStyles = ({
  isConflict,
  isError,
  isGiven,
  isSolved,
  isPlaced,
  isTransientConflict,
  conflictPulse = 0,
  isNumberHighlighted,
}: Pick<
  SudokuCellProps,
  | 'isConflict'
  | 'isError'
  | 'isGiven'
  | 'isSolved'
  | 'isPlaced'
  | 'isTransientConflict'
  | 'conflictPulse'
  | 'isNumberHighlighted'
>) => {
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
    color === 'text-error' && 'ink-alarm',
    (isConflict || isError) &&
      'underline-in underline decoration-error decoration-wavy decoration-[1.5px]',
    isTransientConflict &&
      (prefersReducedMotion()
        ? 'conflict-mark'
        : cn('conflict-pulse', conflictPulse % 2 === 0 && 'conflict-pulse-b')),
  )
}

const getMarkMotion = (
  animateEntry?: boolean,
  strikeRemovedNotes?: boolean,
): MarkMotion | undefined => {
  if (animateEntry) return 'toggle'
  if (strikeRemovedNotes) return 'strike'
  return undefined
}

/**
 * Renders a single cell within the Sudoku grid.
 * This is a controlled component where all user input is handled by the parent grid.
 * It receives a ref to allow the parent to manage focus.
 */
const SudokuCell = forwardRef<HTMLInputElement, SudokuCellProps>((props, ref) => {
  const {
    cell,
    index,
    onFocus,
    onTap,
    eliminatedCandidates,
    animateEntry,
    strikeRemovedNotes,
    moment,
    momentDelay,
    momentKey,
    ...styleProps
  } = props
  const handleFocus = () => onFocus(index)
  const handleClick = () => onTap?.(index)

  const row = Math.floor(index / 9)
  const col = index % 9

  const backgroundClasses = getBackgroundStyles(styleProps)
  const textClasses = getInputTextStyles(styleProps)

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
        {moment && (
          <span
            key={momentKey}
            aria-hidden
            data-testid="cell-moment"
            data-moment={moment}
            className="board-moment"
            style={{ '--moment-delay': `${momentDelay ?? 0}ms` } as CSSProperties}
          />
        )}
        {cell.value === null ? (
          <PencilMarks
            candidates={cell.candidates}
            centers={cell.centers}
            eliminations={eliminatedCandidates}
            motion={getMarkMotion(animateEntry, strikeRemovedNotes)}
          />
        ) : (
          // Scaling the input would scale its ring too. The digit draws here instead, keyed to replay per entry.
          <span
            key={cell.value}
            aria-hidden
            data-testid="cell-digit"
            className={cn(
              'cell-ink leading-none underline-offset-4',
              textClasses,
              animateEntry && 'ink-in',
            )}
          >
            {cell.value}
          </span>
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
        onClick={handleClick}
        className={cn(
          'cell-ink absolute inset-0 z-10 size-full appearance-none rounded-none border-0 bg-transparent p-0 text-center caret-transparent outline-none',
          'focus:z-20 focus-visible:ring-2 focus-visible:ring-inset',
          props.isHintTarget
            ? 'ring-solver focus-visible:ring-solver'
            : 'ring-ink focus-visible:ring-ink',
          props.isActive && 'cell-on ring-2 ring-inset',
          'text-transparent',
        )}
        aria-label={`Sudoku cell at row ${row + 1}, column ${col + 1}`}
        aria-invalid={props.isConflict || props.isError}
      />
    </div>
  )
})

SudokuCell.displayName = 'SudokuCell'
export default memo(SudokuCell)
