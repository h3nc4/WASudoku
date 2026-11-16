/*
 * Copyright (C) 2026  Henrique Almeida
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

import {
  CELL_TESTID,
  cellAttributes,
  type CellView,
  centerSize,
  cornerSlots,
  isCrossed,
} from '../components/view'
import { type CellView as GameCell, digitsOf } from '../core/game/selectors'

// Maps the game's cell to the markup's, and writes one cell node as Board.astro first drew it.

const SVG = 'http://www.w3.org/2000/svg'
const CROSS = 'M10 10 90 90M90 10 10 90'
const CROSS_BOX = '0 0 100 100'

/** The markup's view of a cell. A walkthrough draws every digit it filled in the solver's voice. */
export function drawnCell(cell: GameCell | undefined, walkthrough: boolean): CellView {
  if (cell === undefined) return {}
  const solved = walkthrough && cell.digit !== null && !cell.given && !cell.placed
  return {
    ...(cell.digit === null ? {} : { value: cell.digit }),
    given: cell.given,
    corner: digitsOf(cell.candidates),
    center: digitsOf(cell.centers),
    struck: digitsOf(cell.eliminated),
    selected: cell.selected,
    peer: cell.peer && !cell.selected,
    same: cell.sameDigit,
    invalid: cell.conflict || cell.wrong,
    placed: cell.placed,
    cause: cell.cause,
    target: cell.hintTarget,
    solved,
    flashing: cell.flashing,
  }
}

const FLAGS = [
  'given',
  'selected',
  'peer',
  'same',
  'invalid',
  'placed',
  'cause',
  'target',
  'solved',
  'flashing',
] as const
const LISTS = ['corner', 'center', 'struck'] as const

const listKey = (digits: readonly number[] | undefined): string => (digits ?? []).join('')

/** True when both cells draw alike. The binding then skips the write. */
export const sameDrawn = (a: CellView, b: CellView): boolean =>
  a.value === b.value &&
  FLAGS.every((flag) => (a[flag] ?? false) === (b[flag] ?? false)) &&
  LISTS.every((list) => listKey(a[list]) === listKey(b[list]))

/** What the cell's children draw, which changes less often than its attributes. */
export function contentKey(cell: CellView): string {
  const empty = cell.value === undefined
  const center = empty ? listKey(cell.center) : ''
  const corner = empty && center === '' ? listKey(cell.corner) : ''
  return [
    cell.value ?? '',
    isCrossed(cell),
    center,
    corner,
    corner === '' ? '' : listKey(cell.struck),
  ].join('|')
}

function span(doc: Document, className: string | null, text: string): HTMLSpanElement {
  const element = doc.createElement('span')
  if (className !== null) element.className = className
  element.textContent = text
  return element
}

function cross(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'x')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('viewBox', CROSS_BOX)
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.dataset['testid'] = CELL_TESTID.errorMark
  const path = doc.createElementNS(SVG, 'path')
  path.setAttribute('d', CROSS)
  svg.append(path)
  return svg
}

/** The cell's children, as Board.astro renders them. */
export function cellContent(doc: Document, cell: CellView): Node[] {
  const empty = cell.value === undefined
  if (!empty) {
    const digit = span(doc, 'd', String(cell.value))
    digit.setAttribute('aria-hidden', 'true')
    digit.dataset['testid'] = CELL_TESTID.digit
    return isCrossed(cell) ? [cross(doc), digit] : [digit]
  }
  // A hidden break before each note splits the digits for name checks, as the label spells them.
  // It adds no text, so the face reads as the React app's did.
  const notes = span(doc, 'n', '')
  notes.setAttribute('aria-hidden', 'true')
  const center = cell.center ?? []
  if (center.length > 0) {
    notes.dataset['center'] = centerSize(center)
    for (const digit of center)
      notes.append(doc.createElement('br'), span(doc, null, String(digit)))
    return [notes]
  }
  if ((cell.corner ?? []).length === 0) return []
  for (const slot of cornerSlots(cell)) {
    const mark = span(doc, null, slot.digit === undefined ? '' : String(slot.digit))
    if (slot.struck !== undefined) mark.dataset['struck'] = ''
    notes.append(doc.createElement('br'), mark)
  }
  return [notes]
}

const FIXED = new Set(['id', 'tabindex'])

/** The attributes this module writes. The id is fixed, and the roving tab stop sets tabindex. */
export const stateAttributes = (index: number, cell: CellView): [string, string | undefined][] =>
  Object.entries(cellAttributes(index, cell, false))
    .filter(([name]) => !FIXED.has(name))
    .map(([name, value]) => [name, value === undefined ? undefined : String(value)])
