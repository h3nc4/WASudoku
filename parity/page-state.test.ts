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

import { afterEach, describe, expect, it, vi } from 'vitest'

import { boardHasDigits, readPageState } from './page-state.ts'

const CELLS = 81

const line = (label: string) =>
  readPageState()
    .split('\n')
    .find((text) => text.startsWith(`${label}: `))

// The reference draws inputs named by row and column, with the theme as a root class.
function referenceBoard(values: Record<number, string>) {
  document.documentElement.className = 'dark'
  document.body.innerHTML = Array.from(
    { length: CELLS },
    (_, i) =>
      `<input aria-label="Sudoku cell at row ${Math.floor(i / 9) + 1}, column ${(i % 9) + 1}" value="${values[i] ?? ''}">`,
  ).join('')
}

// The candidate draws gridcells with the digit in its own layer and notes beside it.
function candidateBoard(values: Record<number, string>, notes: Record<number, string> = {}) {
  document.documentElement.dataset['theme'] = 'dark'
  document.body.innerHTML = `<div role="grid">${Array.from({ length: CELLS }, (_, i) => {
    const name = `R${Math.floor(i / 9) + 1}C${(i % 9) + 1}`
    const value = values[i]
    const label = value ? `${name}, ${value}` : `${name}, empty`
    const digit = value ? `<span data-testid="cell-digit">${value}</span>` : ''
    const note = notes[i] ? `<span class="n">${notes[i]}</span>` : ''
    return `<div role="gridcell" tabindex="-1" aria-label="${label}">${digit}${note}</div>`
  }).join('')}</div>`
}

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.className = ''
  delete document.documentElement.dataset['theme']
  document.body.innerHTML = ''
})

describe('readPageState', () => {
  it('reads the same board, theme and focus from either build', () => {
    referenceBoard({ 0: '5', 2: '4' })
    document.querySelector<HTMLElement>('input[aria-label$="column 3"]')?.focus()
    const ref = [line('theme'), line('board'), line('focus')]

    candidateBoard({ 0: '5', 2: '4' }, { 3: '26' })
    document.querySelector<HTMLElement>('[aria-label^="R1C3,"]')?.focus()
    const candidate = [line('theme'), line('board'), line('focus')]

    expect(ref).toEqual([
      'theme: ["dark"]',
      `board: "5.4${'.'.repeat(CELLS - 3)}"`,
      'focus: "R1C3"',
    ])
    expect(candidate).toEqual(ref)
  })
})

// jsdom lays nothing out, so every element but a closed native dialog's content reads as shown.
function layOut() {
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    const shown = !this.closest('dialog:not([open])')
    return (shown ? [new DOMRect()] : []) as unknown as DOMRectList
  })
}

const linesOf = (prefix: string) =>
  readPageState()
    .split('\n')
    .filter((text) => text.startsWith(prefix))

describe('readPageState on the input modes and dialogs', () => {
  it('reads native radios and shown native dialogs as the reference reads its own', () => {
    layOut()
    document.body.innerHTML = `
      <div role="radiogroup" aria-label="Input Mode">
        <button role="radio" aria-checked="true">Pen</button>
        <button role="radio" aria-checked="false">Corner</button>
      </div>
      <div role="dialog">Abandon current game?</div>`
    const ref = [...linesOf('control'), ...linesOf('dialog')]

    document.body.innerHTML = `
      <fieldset><legend>Input Mode</legend>
        <label><input type="radio" name="m" checked>Pen</label>
        <label><input type="radio" name="m">Corner</label>
      </fieldset>
      <dialog open>Abandon current game?</dialog>
      <dialog>Reveal the solution?</dialog>`
    const candidate = [...linesOf('control'), ...linesOf('dialog')]

    expect(ref).toEqual([
      'control Pen: "enabled - true -"',
      'control Corner: "enabled - false -"',
      'dialog: "Abandon current game?"',
    ])
    expect(candidate).toEqual(ref)
  })
})

describe('boardHasDigits', () => {
  it('finds a digit in either build and none on an empty board', () => {
    referenceBoard({ 40: '7' })
    expect(boardHasDigits()).toBe(true)
    candidateBoard({ 40: '7' })
    expect(boardHasDigits()).toBe(true)
    candidateBoard({}, { 0: '123' })
    expect(boardHasDigits()).toBe(false)
  })
})
