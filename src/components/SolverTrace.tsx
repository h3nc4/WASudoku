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

import type { SolvingStep } from '@/context/sudoku.types'
import { getTechniqueName } from '@/lib/techniques'
import { formatCell } from '@/lib/utils'

interface TraceEntryProps {
  readonly tag: string
  readonly cells: readonly number[]
  readonly value?: number
  readonly label: string
}

/** One line of the engine's trace, laid out by the three-column grid of its parent. */
export function TraceEntry({ tag, cells, value, label }: TraceEntryProps) {
  let where = cells.length > 0 ? formatCell(cells[0]) : ''
  if (cells.length > 1) where += ` +${cells.length - 1}`
  if (value !== undefined) where += ` = ${value}`

  // Screen readers join the spans on these spaces, which a grid leaves out of layout.
  return (
    <>
      <span>{tag}</span> <span className="whitespace-nowrap">{where}</span>{' '}
      <span className="min-w-0 break-words">{label}</span>
    </>
  )
}

interface StepEntryProps {
  readonly tag: string
  readonly step: SolvingStep
  /** False for hints, which show the cell alone and leave the digit to the explanation. */
  readonly withValue?: boolean
}

/** A trace line for a solving step, pointing at its placement or else at its pattern cells. */
export function StepEntry({ tag, step, withValue = true }: StepEntryProps) {
  const { placements, cause, eliminations } = step
  let cells = eliminations.map((e) => e.index)
  if (placements.length > 0) cells = placements.map((p) => p.index)
  else if (cause.length > 0) cells = cause.map((c) => c.index)
  const value = withValue && placements.length === 1 ? placements[0].value : undefined

  return (
    <TraceEntry tag={tag} cells={cells} value={value} label={getTechniqueName(step.technique)} />
  )
}
