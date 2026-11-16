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

import { describe, expect, it } from 'vitest'

import { type KeyAction, type KeyContext, keymap, type KeyPress, opensShortcuts } from './keymap'

const PLAYING: KeyContext = {
  inGrid: false,
  typing: false,
  dialogOpen: false,
  gridReadOnly: false,
  canUndo: true,
  canSticky: true,
  stickyLocked: false,
  walkthrough: false,
}

/** Play while a walkthrough shows: the grid and sticky numbers are locked, undo is not allowed. */
const WALKTHROUGH: KeyContext = {
  ...PLAYING,
  gridReadOnly: true,
  canUndo: false,
  canSticky: false,
  walkthrough: true,
}

const IN_GRID: KeyContext = { ...PLAYING, inGrid: true }

const press = (key: string, modifiers: Partial<KeyPress> = {}): KeyPress => ({
  key,
  ctrl: false,
  meta: false,
  alt: false,
  shift: false,
  ...modifiers,
})

const commands = (actions: KeyAction[]) => actions.map((action) => action.command)

// Ported from the keyboard cases of SudokuGrid.
describe('grid keys', () => {
  it('calls inputValue and setHighlightedValue on number key press', () => {
    expect(keymap(press('5'), IN_GRID)).toEqual([
      { command: { kind: 'digit', digit: 5 }, preventDefault: true },
    ])
  })

  it('ignores keyboard input when in a read-only mode', () => {
    expect(keymap(press('5'), { ...IN_GRID, gridReadOnly: true })).toEqual([])
  })

  it.each([
    ['ArrowUp', 'up'],
    ['ArrowDown', 'down'],
    ['ArrowLeft', 'left'],
    ['ArrowRight', 'right'],
  ])('calls navigate for %s key', (key, direction) => {
    expect(commands(keymap(press(key), IN_GRID))).toEqual([{ kind: 'move', direction }])
  })

  it('handles Backspace to call eraseActiveCell("backspace")', () => {
    expect(commands(keymap(press('Backspace'), IN_GRID))).toEqual([
      { kind: 'erase', how: 'backspace' },
    ])
  })

  it('handles Delete to call eraseActiveCell("delete")', () => {
    expect(commands(keymap(press('Delete'), IN_GRID))).toEqual([{ kind: 'erase', how: 'delete' }])
  })

  it('calls preventDefault for handled keys', () => {
    expect(keymap(press('ArrowRight'), IN_GRID)[0]?.preventDefault).toBe(true)
  })

  it('erases the active cell on 0', () => {
    expect(commands(keymap(press('0'), IN_GRID))).toEqual([{ kind: 'erase', how: 'delete' }])
  })

  it.each([' ', 'n', 'N'])('cycles the input mode on %j', (key) => {
    expect(keymap(press(key), IN_GRID)).toEqual([
      { command: { kind: 'cycleMode' }, preventDefault: true },
    ])
  })

  it('leaves modified keys to the browser and global shortcuts', () => {
    for (const modifier of ['ctrl', 'meta', 'alt'] as const) {
      expect(keymap(press('5', { [modifier]: true }), IN_GRID)).toEqual([])
    }
  })

  it('does not call preventDefault for unhandled keys', () => {
    expect(keymap(press('a'), IN_GRID)).toEqual([])
  })

  it('takes grid keys only while focus is in the grid', () => {
    expect(keymap(press('5'), PLAYING)).toEqual([])
  })
})

// Ported from useKeyboardShortcuts.
describe('page keys', () => {
  it('undoes on Ctrl+Z and Cmd+Z', () => {
    expect(keymap(press('z', { ctrl: true }), PLAYING)).toEqual([
      { command: { kind: 'undo' }, preventDefault: true },
    ])
    expect(commands(keymap(press('Z', { meta: true }), PLAYING))).toEqual([{ kind: 'undo' }])
  })

  it('redoes on Ctrl+Y and Ctrl+Shift+Z', () => {
    expect(commands(keymap(press('y', { ctrl: true }), PLAYING))).toEqual([{ kind: 'redo' }])
    expect(commands(keymap(press('Z', { ctrl: true, shift: true }), PLAYING))).toEqual([
      { kind: 'redo' },
    ])
    expect(commands(keymap(press('Y', { ctrl: true, shift: true }), PLAYING))).toEqual([
      { kind: 'redo' },
    ])
  })

  it('leaves other modified keys and Ctrl+Alt+Z alone', () => {
    expect(keymap(press('c', { ctrl: true }), PLAYING)).toEqual([])
    expect(keymap(press('z', { ctrl: true, alt: true }), PLAYING)).toEqual([])
  })

  it('ignores undo while the state does not allow it', () => {
    expect(keymap(press('z', { ctrl: true }), { ...PLAYING, canUndo: false })).toEqual([])
    expect(keymap(press('z', { ctrl: true }), WALKTHROUGH)).toEqual([])
  })

  it('steps through a solution with the arrow keys while visualizing', () => {
    expect(keymap(press('ArrowLeft'), WALKTHROUGH)).toEqual([
      { command: { kind: 'step', delta: -1 }, preventDefault: true },
    ])
    expect(commands(keymap(press('ArrowRight'), WALKTHROUGH))).toEqual([{ kind: 'step', delta: 1 }])
    expect(keymap(press('ArrowRight', { shift: true }), WALKTHROUGH)).toEqual([])
    expect(keymap(press('ArrowRight', { alt: true }), WALKTHROUGH)).toEqual([])
  })

  it('leaves other keys alone while visualizing', () => {
    expect(keymap(press('ArrowUp'), WALKTHROUGH)).toEqual([])
    expect(keymap(press('ArrowLeft'), { ...WALKTHROUGH, inGrid: true })).toHaveLength(1)
  })

  it('leaves the arrow keys to the grid during play', () => {
    expect(keymap(press('ArrowLeft'), PLAYING)).toEqual([])
    expect(commands(keymap(press('ArrowLeft'), IN_GRID))).toEqual([
      { kind: 'move', direction: 'left' },
    ])
  })

  it('stays out of the way while a dialog is open', () => {
    expect(keymap(press('z', { ctrl: true }), { ...PLAYING, dialogOpen: true })).toEqual([])
    expect(keymap(press('s'), { ...PLAYING, dialogOpen: true })).toEqual([])
  })
})

describe('sticky keys', () => {
  const LOCKED: KeyContext = { ...PLAYING, stickyLocked: true }

  it('toggles on S in either case', () => {
    expect(keymap(press('s'), PLAYING)).toEqual([
      { command: { kind: 'toggleSticky' }, preventDefault: true },
    ])
    expect(commands(keymap(press('S', { shift: true }), PLAYING))).toEqual([
      { kind: 'toggleSticky' },
    ])
  })

  it('leaves Ctrl+S and Alt+S to the browser', () => {
    expect(keymap(press('s', { ctrl: true }), PLAYING)).toEqual([])
    expect(keymap(press('s', { alt: true }), PLAYING)).toEqual([])
  })

  it('releases the lock on Escape', () => {
    expect(keymap(press('Escape'), LOCKED)).toEqual([
      { command: { kind: 'releaseSticky' }, preventDefault: false },
    ])
  })

  it('ignores Escape with nothing locked', () => {
    expect(keymap(press('Escape'), PLAYING)).toEqual([])
  })

  it('is ignored while sticky numbers cannot be used', () => {
    const blocked = { ...LOCKED, canSticky: false }
    expect(keymap(press('s'), blocked)).toEqual([])
    expect(keymap(press('Escape'), blocked)).toEqual([])
  })

  it('leaves the letter to a field that takes typing, but not to a read-only cell', () => {
    expect(keymap(press('s'), { ...PLAYING, typing: true })).toEqual([])
    expect(commands(keymap(press('s'), IN_GRID))).toEqual([{ kind: 'toggleSticky' }])
  })
})

describe('the shortcuts key', () => {
  it('opens on ? with or without Shift, and does nothing in the keymap', () => {
    expect(opensShortcuts(press('?'), PLAYING)).toBe(true)
    expect(opensShortcuts(press('?', { shift: true }), WALKTHROUGH)).toBe(true)
    expect(keymap(press('?', { shift: true }), IN_GRID)).toEqual([])
  })

  it('leaves ? to a text field, an open dialog and a modified press', () => {
    expect(opensShortcuts(press('?'), { ...PLAYING, typing: true })).toBe(false)
    expect(opensShortcuts(press('?'), { ...PLAYING, dialogOpen: true })).toBe(false)
    expect(opensShortcuts(press('?', { ctrl: true }), PLAYING)).toBe(false)
    expect(opensShortcuts(press('/'), PLAYING)).toBe(false)
  })
})
