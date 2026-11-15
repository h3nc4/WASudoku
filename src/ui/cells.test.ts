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

import { describe, expect, it } from 'vitest'

import type { CellView as GameCell } from '../core/game/selectors'
import { cellContent, contentKey, drawnCell, sameDrawn, stateAttributes } from './cells'

const mask = (...digits: number[]) => digits.reduce((bits, digit) => bits | (1 << (digit - 1)), 0)

const BLANK: GameCell = {
  digit: null,
  given: false,
  candidates: 0,
  centers: 0,
  eliminated: 0,
  conflict: false,
  wrong: false,
  selected: false,
  peer: false,
  sameDigit: false,
  cause: false,
  placed: false,
  hintTarget: false,
  flashing: false,
}

const html = (nodes: Node[]) => {
  const host = document.createElement('div')
  host.append(...nodes)
  return host.innerHTML
}

describe('drawnCell', () => {
  it('draws nothing for a cell the state lacks', () => {
    expect(drawnCell(undefined, false)).toEqual({})
  })

  it('maps the game cell to the markup, the selected cell out of its own peers', () => {
    const cell = drawnCell(
      { ...BLANK, digit: 6, selected: true, peer: true, sameDigit: true, wrong: true },
      false,
    )
    expect(cell).toMatchObject({ value: 6, selected: true, peer: false, same: true, invalid: true })
    expect(drawnCell({ ...BLANK, conflict: true }, false).invalid).toBe(true)
    expect(drawnCell({ ...BLANK, candidates: mask(1, 9) }, false)).toMatchObject({
      corner: [1, 9],
      center: [],
    })
    expect(drawnCell({ ...BLANK, hintTarget: true }, false).target).toBe(true)
  })

  it('voices only what a walkthrough filled in as solver output', () => {
    expect(drawnCell({ ...BLANK, digit: 3 }, true).solved).toBe(true)
    expect(drawnCell({ ...BLANK, digit: 3 }, false).solved).toBe(false)
    expect(drawnCell({ ...BLANK, digit: 3, given: true }, true).solved).toBe(false)
    expect(drawnCell({ ...BLANK, digit: 3, placed: true }, true).solved).toBe(false)
    expect(drawnCell(BLANK, true).solved).toBe(false)
  })
})

describe('sameDrawn', () => {
  it('compares values, flags and note lists, an absent flag reading as false', () => {
    expect(sameDrawn({}, { selected: false, corner: [] })).toBe(true)
    expect(sameDrawn({ value: 1 }, { value: 2 })).toBe(false)
    expect(sameDrawn({ peer: true }, {})).toBe(false)
    expect(sameDrawn({ corner: [1, 2] }, { corner: [1, 2] })).toBe(true)
    expect(sameDrawn({ struck: [1] }, { struck: [2] })).toBe(false)
  })
})

describe('contentKey', () => {
  it('changes with what the children draw and nothing else', () => {
    expect(contentKey({ value: 4 })).not.toBe(contentKey({ value: 4, invalid: true }))
    expect(contentKey({ value: 4, selected: true })).toBe(contentKey({ value: 4 }))
    expect(contentKey({ center: [1], corner: [2] })).toBe(contentKey({ center: [1], corner: [3] }))
    expect(contentKey({ corner: [2], struck: [2] })).not.toBe(contentKey({ corner: [2] }))
    expect(contentKey({ struck: [2] })).toBe(contentKey({}))
  })
})

describe('cellContent', () => {
  it('draws a digit, crossed when it is wrong', () => {
    expect(html(cellContent(document, { value: 5 }))).toBe(
      '<span class="d" aria-hidden="true" data-testid="cell-digit">5</span>',
    )
    const wrong = cellContent(document, { value: 5, invalid: true })
    expect(wrong[0]).toBeInstanceOf(SVGSVGElement)
    expect(wrong[0]).toHaveAttribute('data-testid', 'cell-error-mark')
    expect(html(wrong)).toContain('<path d="M10 10 90 90M90 10 10 90"></path>')
  })

  it('draws center notes over corner notes, sized by their count', () => {
    const few = html(cellContent(document, { center: [2, 6], corner: [1] }))
    expect(few).toBe(
      '<span class="n" aria-hidden="true" data-center="few"> <span>2</span> <span>6</span></span>',
    )
    const many = cellContent(document, { center: [1, 2, 3, 4, 5] })
    expect(many[0]).toHaveAttribute('data-center', 'many')
  })

  it('draws corner notes in nine slots, striking the eliminated ones', () => {
    const [notes] = cellContent(document, { corner: [1, 9], struck: [9] })
    const slots = [...(notes as HTMLElement).children]
    expect(slots).toHaveLength(9)
    expect(slots.map((slot) => slot.textContent).join('')).toBe('19')
    expect(slots[8]).toHaveAttribute('data-struck', '')
    expect(slots[0]).not.toHaveAttribute('data-struck')
    expect(cellContent(document, {})).toEqual([])
  })
})

describe('stateAttributes', () => {
  it('leaves the id and the tab stop alone', () => {
    const names = stateAttributes(0, { value: 5, given: true }).map(([name]) => name)
    expect(names).not.toContain('id')
    expect(names).not.toContain('tabindex')
    expect(Object.fromEntries(stateAttributes(0, { value: 5, given: true }))).toMatchObject({
      'aria-label': 'R1C1, 5, given',
      'aria-readonly': 'true',
      'data-peer': undefined,
    })
  })
})
