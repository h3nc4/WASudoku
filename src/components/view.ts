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

import { formatTime } from '../core/text/format'

/** What the markup draws, as plain data. Astro renders it at build and the UI modules patch it later. */

export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export const DIGITS: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export const BOARD_SIZE = 9

export const CELL_COUNT = BOARD_SIZE * BOARD_SIZE

/** The data-testid names the React app gave a cell's layers, kept as a contract for the e2e suite.
 * The gridcell is the face, since it draws its own digit or notes. */
export const CELL_TESTID = {
  face: 'cell-background',
  errorMark: 'cell-error-mark',
  digit: 'cell-digit',
} as const

/** One cell as drawn. Fills are exclusive, so at most one of selected, peer, same and placed is set.
 * A target's stripes give way to the highlighter on a selected cell. */
export interface CellView {
  readonly value?: Digit
  readonly given?: boolean
  readonly corner?: readonly Digit[]
  readonly center?: readonly Digit[]
  /** Corner notes a walkthrough step eliminates, drawn struck through. */
  readonly struck?: readonly Digit[]
  readonly selected?: boolean
  readonly peer?: boolean
  readonly same?: boolean
  readonly invalid?: boolean
  /** The walkthrough step's placement. */
  readonly placed?: boolean
  /** A cell the walkthrough step or the hint reasons from. */
  readonly cause?: boolean
  /** The cell a hint points at. */
  readonly target?: boolean
  /** Solver output, in the mono voice. */
  readonly solved?: boolean
  /** A peer holding the digit a note was refused for, pulsed red for a moment. */
  readonly flashing?: boolean
}

export type GameMode = 'selecting' | 'playing' | 'customInput' | 'visualizing'

export type InputMode = 'normal' | 'candidate' | 'center'

export interface Control {
  readonly disabled?: boolean
  readonly title?: string
}

export interface StatusView {
  readonly difficulty: string
  readonly mistakes: number
  readonly time: string
  readonly solved?: boolean
}

export interface ControlsView {
  readonly undo: Control
  readonly redo: Control
  readonly autoFill: Control
  readonly erase: Control
  readonly sticky: Control & { readonly on?: boolean }
  readonly solve: Control
  readonly hint: Control
  readonly clear: Control
}

export interface TraceRow {
  readonly where: string
  readonly label: string
}

export interface WalkthroughView {
  readonly steps: readonly TraceRow[]
  /** The position shown: 0 is the puzzle as given, steps.length the solution. */
  readonly current: number
  readonly explanation: string
}

export interface AppView {
  readonly mode: GameMode
  readonly cells: readonly CellView[]
  /** The player's board, which the pad counts from while a walkthrough shows the solver's. */
  readonly playerCells?: readonly CellView[]
  readonly inputMode: InputMode
  readonly controls: ControlsView
  readonly status?: StatusView
  readonly walkthrough?: WalkthroughView
  /** What the win dialog says once it opens. */
  readonly winSummary?: string
}

export const MAX_MISTAKES = 3

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Expert', 'Extreme'] as const

/** The board's name for a cell, as the trace and the hint strip print it. */
export const cellName = (index: number): string =>
  `R${String(Math.floor(index / BOARD_SIZE) + 1)}C${String((index % BOARD_SIZE) + 1)}`

// "1, 2, 3", which keeps the visible digits in order within the name, as WCAG 2.5.3 asks.
const spoken = (digits: readonly Digit[]): string => digits.join(', ')

/** What a screen reader hears for a cell. A note never reads as a placed digit. */
export function cellLabel(index: number, cell: CellView): string {
  const parts = [cellName(index)]
  if (cell.value === undefined) {
    parts.push('empty')
    if (cell.corner?.length) parts.push(`candidates ${spoken(cell.corner)}`)
    if (cell.center?.length) parts.push(`center notes ${spoken(cell.center)}`)
  } else {
    parts.push(String(cell.value))
    if (cell.given) parts.push('given')
  }
  if (cell.invalid) parts.push('wrong')
  return parts.join(', ')
}

/** The one cell in the tab order: the selected one, or else the first. */
export const tabStop = (cells: readonly CellView[]): number =>
  Math.max(
    0,
    cells.findIndex((cell) => cell.selected),
  )

const flag = (on: boolean | undefined): '' | undefined => (on ? '' : undefined)

const aria = (on: boolean | undefined): 'true' | undefined => (on ? 'true' : undefined)

/** The gridcell's state attributes. Astro drops the undefined ones. */
export function cellAttributes(index: number, cell: CellView, focusable: boolean) {
  return {
    id: `cell-${String(index)}`,
    tabindex: focusable ? 0 : -1,
    'aria-label': cellLabel(index, cell),
    'aria-readonly': aria(cell.given),
    'aria-selected': aria(cell.selected),
    'aria-invalid': aria(cell.invalid),
    'data-peer': flag(cell.peer),
    'data-same': flag(cell.same),
    'data-solved': flag(cell.solved),
    'data-placed': flag(cell.placed),
    'data-cause': flag(cell.cause),
    'data-target': flag(cell.target),
    'data-flash': flag(cell.flashing),
  }
}

/** A digit drawn in red over the cell-wide X, for a mistake or a refused note's peer. */
export const isCrossed = (cell: CellView): boolean =>
  cell.value !== undefined && (cell.invalid === true || cell.flashing === true)

/** More than this many center notes drop a size, so they still fit on one line. */
export const CENTER_NOTES_FIT = 4

export const centerSize = (center: readonly Digit[]): 'few' | 'many' =>
  center.length > CENTER_NOTES_FIT ? 'many' : 'few'

/** Each corner slot, with its digit when noted and whether a step strikes it. */
export const cornerSlots = (cell: CellView) =>
  DIGITS.map((digit) => ({
    digit: cell.corner?.includes(digit) ? digit : undefined,
    struck: flag(cell.struck?.includes(digit)),
  }))

/** The board as rows of drawn cells. Center notes win over corner notes, as they do in play. */
export function boardRows(cells: readonly CellView[]) {
  const stop = tabStop(cells)
  return Array.from({ length: BOARD_SIZE }, (_, row) =>
    Array.from({ length: BOARD_SIZE }, (_, col) => {
      const index = row * BOARD_SIZE + col
      const cell = cells[index] ?? {}
      const empty = cell.value === undefined
      const center = empty && cell.center?.length ? cell.center : undefined
      return {
        attributes: cellAttributes(index, cell, index === stop),
        value: cell.value,
        wrong: isCrossed(cell),
        center: center && { digits: center, size: centerSize(center) },
        corner: empty && !center && cell.corner?.length ? cornerSlots(cell) : undefined,
      }
    }),
  )
}

/** One drawn cell. A static figure passes looser attributes than the live grid. */
export type DrawnCell = Omit<ReturnType<typeof boardRows>[number][number], 'attributes'> & {
  readonly attributes: Readonly<Record<string, string | number | undefined>>
}

export interface PadKey {
  readonly digit: Digit
  readonly remaining: number
  readonly disabled: boolean
  readonly label: string
}

export const padLabel = (digit: Digit, remaining: number): string =>
  remaining <= 0
    ? `Enter number ${String(digit)}`
    : `Enter number ${String(digit)}, ${String(remaining)} left`

/** One key per digit, with the count left to place. A spent digit is struck and disabled. */
export function padKeys(cells: readonly CellView[], readOnly: boolean): readonly PadKey[] {
  return DIGITS.map((digit) => {
    const placed = cells.filter((cell) => cell.value === digit).length
    const remaining = BOARD_SIZE - placed
    return {
      digit,
      remaining,
      disabled: remaining <= 0 || readOnly,
      label: padLabel(digit, remaining),
    }
  })
}

/** The board takes no input while choosing a puzzle, during a walkthrough or once solved. */
export const isReadOnly = (view: AppView): boolean =>
  view.mode === 'selecting' || view.mode === 'visualizing' || view.status?.solved === true

export const mistakesText = (mistakes: number): string =>
  `${String(mistakes)}/${String(MAX_MISTAKES)}`

export const isMistakeLimit = (mistakes: number): boolean => mistakes >= MAX_MISTAKES

export type StepTone = 'past' | 'current' | 'future'

export const stepTone = (position: number, current: number): StepTone => {
  if (position > current) return 'future'
  return position === current ? 'current' : 'past'
}

/** Positions pad to the width of the step count, which lines the trace up. */
export const stepTag = (position: number, total: number): string =>
  String(position).padStart(String(total).length, '0')

/** Rows of the trace. The solution shares the last step's board, and the last step keeps the mark. */
export function traceRows(walkthrough: WalkthroughView) {
  const { steps, current } = walkthrough
  return steps.map((row, index) => {
    const position = index + 1
    return {
      ...row,
      position,
      tag: stepTag(position, steps.length),
      tone: stepTone(position, current),
    }
  })
}

/** An end row, for the puzzle as given or for the solution, which never takes the current mark. */
export function endRow(position: number, walkthrough: WalkthroughView) {
  const tone = stepTone(position, walkthrough.current)
  const reached = position > 0 && tone === 'current'
  return {
    position,
    tone: reached ? ('reached' as const) : tone,
    current: tone === 'current' && !reached,
  }
}

export const isSolution = (walkthrough: WalkthroughView): boolean =>
  walkthrough.current === walkthrough.steps.length

export const solvedInText = (count: number): string =>
  `Solved in ${String(count)} ${count === 1 ? 'step' : 'steps'}`

/** The walkthrough a page without one renders, hidden until script fills it on a solve. */
export const BLANK_WALKTHROUGH: WalkthroughView = { steps: [], current: 0, explanation: '' }

/** The status a page without one renders, hidden until a game starts. */
export const BLANK_STATUS: StatusView = { difficulty: '', mistakes: 0, time: formatTime(0) }

/** The status bar's first paint, hidden and blank without a status. */
export const statusBar = (status: StatusView | undefined) => ({
  view: status ?? BLANK_STATUS,
  hidden: status === undefined,
})
