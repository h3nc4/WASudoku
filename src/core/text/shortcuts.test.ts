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

import { DIGITS } from '../digits'
import { GRID_KEYS, HISTORY_KEYS, type KeyCommand, WALKTHROUGH_KEYS } from '../keymap'
import { actionOf, keyName, rowsOf, SHORTCUT_SECTIONS, SHORTCUTS_TEXT } from './shortcuts'

const rowsIn = (title: string) =>
  SHORTCUT_SECTIONS.find((section) => section.title === title)?.rows.map((row) => [
    row.chords.map((chord) => chord.join(SHORTCUTS_TEXT.join)),
    row.action,
  ])

describe('keyName', () => {
  it('prints arrows, Space and Esc as caps, and a letter in upper case', () => {
    expect(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map(keyName)).toEqual([
      '↑',
      '↓',
      '←',
      '→',
    ])
    expect([' ', 'Escape', 'n', 'Delete', '?'].map(keyName)).toEqual([
      'Space',
      'Esc',
      'N',
      'Delete',
      '?',
    ])
  })
})

describe('rowsOf', () => {
  it('groups by action in first order and drops a repeated chord', () => {
    expect(
      rowsOf([
        { chord: ['N'], action: 'cycle' },
        { chord: ['Ctrl', 'Z'], action: 'undo' },
        { chord: ['N'], action: 'cycle' },
        { chord: ['Space'], action: 'cycle' },
      ]),
    ).toEqual([
      { action: 'cycle', chords: [['N'], ['Space']] },
      { action: 'undo', chords: [['Ctrl', 'Z']] },
    ])
  })
})

describe('the shortcuts list', () => {
  it('reads the grid keys, the digits as one range', () => {
    expect(rowsIn('On a selected cell')).toEqual([
      [['1–9'], 'Enter the digit, or toggle its note in Corner or Center'],
      [['0', 'Delete'], 'Erase the selected cell'],
      [['Backspace'], 'Erase the selected cell and move to the previous one'],
      [['↑', '↓', '←', '→'], 'Move the selection'],
      [['Space', 'N'], 'Cycle through Pen, Corner and Center'],
    ])
  })

  it('reads the page keys, history with its Shift chord', () => {
    expect(rowsIn('Anywhere')).toEqual([
      [['Ctrl+Z'], 'Undo'],
      [['Ctrl+Shift+Z', 'Ctrl+Y'], 'Redo'],
      [['Ctrl+V'], 'Paste a puzzle string onto the board'],
      [['S'], 'Turn sticky numbers on or off'],
      [['Esc'], 'Release the locked sticky digit'],
      [['?'], 'Show this list'],
    ])
  })

  it('reads the walkthrough keys', () => {
    expect(rowsIn('While viewing the solving steps')).toEqual([
      [['←'], 'Previous solving step'],
      [['→'], 'Next solving step'],
    ])
  })

  it('names every command a binding table holds', () => {
    const actions = new Set(
      SHORTCUT_SECTIONS.flatMap((section) => section.rows.map((row) => row.action)),
    )
    const bound: KeyCommand[] = [
      ...GRID_KEYS.values(),
      ...HISTORY_KEYS.map((entry) => entry.command),
      ...WALKTHROUGH_KEYS.values(),
      ...DIGITS.map((digit) => ({ kind: 'digit', digit }) as const),
    ]
    for (const command of bound) expect(actions.has(actionOf(command))).toBe(true)
  })
})
