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

import { MAX_DIGIT, MIN_DIGIT } from '../digits'
import {
  GRID_KEYS,
  HISTORY_KEYS,
  type KeyCommand,
  RELEASE_KEY,
  SHORTCUTS_KEY,
  STICKY_KEY,
  WALKTHROUGH_KEYS,
} from '../keymap'

/** Key caps pressed together, such as Ctrl, Shift and Z. */
export type Chord = readonly string[]

/** One action and the chords that do it. */
export interface ShortcutRow {
  readonly chords: readonly Chord[]
  readonly action: string
}

export interface ShortcutSection {
  readonly title: string
  readonly rows: readonly ShortcutRow[]
}

/** The dialog's own text. The app doesn't detect the platform, and the note names Cmd on macOS. */
export const SHORTCUTS_TEXT = {
  title: 'Keyboard shortcuts',
  open: 'Keyboard shortcuts',
  keys: 'Keys',
  action: 'Action',
  join: '+',
  /** Spaced, since the markup leaves the chords touching. */
  or: ' or ',
  note: 'On macOS, Cmd works in place of Ctrl.',
} as const

/** The modifier HISTORY_KEYS names, which the keymap also takes as Cmd. */
export const MODIFIER = 'Ctrl'
const SHIFT = 'Shift'
/** The browser's own paste, which the grid reads as a puzzle string rather than a key binding. */
export const PASTE_KEY = 'v'
const DIGIT_RANGE = `${String(MIN_DIGIT)}–${String(MAX_DIGIT)}`

const KEY_NAMES: Readonly<Record<string, string>> = {
  ' ': 'Space',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
}

/** The cap a key value is printed as, a letter in upper case and a named key as it is. */
export const keyName = (key: string): string =>
  KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key)

/** What a command does, in the words of the shortcuts list. */
export function actionOf(command: KeyCommand): string {
  switch (command.kind) {
    case 'digit':
      return 'Enter the digit, or toggle its note in Corner or Center'
    case 'erase':
      return command.how === 'delete'
        ? 'Erase the selected cell'
        : 'Erase the selected cell and move to the previous one'
    case 'move':
      return 'Move the selection'
    case 'cycleMode':
      return 'Cycle through Pen, Corner and Center'
    case 'toggleSticky':
      return 'Turn sticky numbers on or off'
    case 'releaseSticky':
      return 'Release the locked sticky digit'
    case 'undo':
      return 'Undo'
    case 'redo':
      return 'Redo'
    case 'step':
      return command.delta < 0 ? 'Previous solving step' : 'Next solving step'
  }
}

const PASTE_ACTION = 'Paste a puzzle string onto the board'
const SHORTCUTS_ACTION = 'Show this list'

interface Binding {
  readonly chord: Chord
  readonly action: string
}

/** Groups bindings by action in their first order, dropping a chord seen twice, as n and N are. */
export function rowsOf(bindings: readonly Binding[]): ShortcutRow[] {
  const rows = new Map<string, Chord[]>()
  for (const { chord, action } of bindings) {
    const chords = rows.get(action) ?? []
    if (!chords.some((known) => known.join() === chord.join())) chords.push(chord)
    rows.set(action, chords)
  }
  return [...rows].map(([action, chords]) => ({ action, chords }))
}

const fromMap = (keys: ReadonlyMap<string, KeyCommand>): Binding[] =>
  [...keys].map(([key, command]) => ({
    chord: [command.kind === 'digit' ? DIGIT_RANGE : keyName(key)],
    action: actionOf(command),
  }))

const historyBindings: Binding[] = HISTORY_KEYS.map(({ key, shift, command }) => ({
  chord: shift === true ? [MODIFIER, SHIFT, keyName(key)] : [MODIFIER, keyName(key)],
  action: actionOf(command),
}))

/** The list the shortcuts dialog shows, read off the keymap's own tables. */
export const SHORTCUT_SECTIONS: readonly ShortcutSection[] = [
  { title: 'On a selected cell', rows: rowsOf(fromMap(GRID_KEYS)) },
  {
    title: 'Anywhere',
    rows: rowsOf([
      ...historyBindings,
      { chord: [MODIFIER, keyName(PASTE_KEY)], action: PASTE_ACTION },
      { chord: [keyName(STICKY_KEY)], action: actionOf({ kind: 'toggleSticky' }) },
      { chord: [keyName(RELEASE_KEY)], action: actionOf({ kind: 'releaseSticky' }) },
      { chord: [keyName(SHORTCUTS_KEY)], action: SHORTCUTS_ACTION },
    ]),
  },
  { title: 'While viewing the solving steps', rows: rowsOf(fromMap(WALKTHROUGH_KEYS)) },
]
