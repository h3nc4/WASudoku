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

import { type Digit, DIGITS } from './digits'
import type { Direction } from './geometry'

/** What a key asks for. The game decides whether the current state allows it. */
export type KeyCommand =
  | { readonly kind: 'digit'; readonly digit: Digit }
  | { readonly kind: 'erase'; readonly how: 'delete' | 'backspace' }
  | { readonly kind: 'move'; readonly direction: Direction }
  | { readonly kind: 'cycleMode' }
  | { readonly kind: 'toggleSticky' }
  | { readonly kind: 'releaseSticky' }
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
  | { readonly kind: 'step'; readonly delta: -1 | 1 }

/** A keydown as the runtime reads it off the event. */
export interface KeyPress {
  readonly key: string
  readonly ctrl: boolean
  readonly meta: boolean
  readonly alt: boolean
  readonly shift: boolean
}

/** The facts a key's meaning depends on, gathered by the runtime from the page and the state. */
export interface KeyContext {
  /** Focus sits on a grid cell. */
  readonly inGrid: boolean
  /** The target takes typing, a text field that is not read-only, so letters belong to it. */
  readonly typing: boolean
  readonly dialogOpen: boolean
  readonly gridReadOnly: boolean
  readonly canUndo: boolean
  readonly canSticky: boolean
  readonly stickyLocked: boolean
  readonly walkthrough: boolean
}

export interface KeyAction {
  readonly command: KeyCommand
  /** Stops the browser's own use of the key, such as scrolling on Space or the arrows. */
  readonly preventDefault: boolean
}

const command = <C extends KeyCommand>(value: C): C => value

/** Keys a focused cell takes without a modifier, every one of them kept from the browser. */
export const GRID_KEYS: ReadonlyMap<string, KeyCommand> = new Map<string, KeyCommand>([
  ...DIGITS.map((digit) => [String(digit), command({ kind: 'digit', digit })] as const),
  ['0', { kind: 'erase', how: 'delete' }],
  ['Delete', { kind: 'erase', how: 'delete' }],
  ['Backspace', { kind: 'erase', how: 'backspace' }],
  ['ArrowUp', { kind: 'move', direction: 'up' }],
  ['ArrowDown', { kind: 'move', direction: 'down' }],
  ['ArrowLeft', { kind: 'move', direction: 'left' }],
  ['ArrowRight', { kind: 'move', direction: 'right' }],
  [' ', { kind: 'cycleMode' }],
  ['n', { kind: 'cycleMode' }],
  ['N', { kind: 'cycleMode' }],
])

/** Ctrl or Cmd with these letters, matched in lower case, and with Shift where the entry says. */
export const HISTORY_KEYS: readonly { key: string; shift: boolean | null; command: KeyCommand }[] =
  [
    { key: 'z', shift: false, command: { kind: 'undo' } },
    { key: 'z', shift: true, command: { kind: 'redo' } },
    { key: 'y', shift: null, command: { kind: 'redo' } },
  ]

/** Sticky numbers toggles on this letter in either case. */
export const STICKY_KEY = 's'
/** Releases a locked sticky digit. */
export const RELEASE_KEY = 'Escape'

/** Steps through the walkthrough, without Shift or Alt. */
export const WALKTHROUGH_KEYS: ReadonlyMap<string, KeyCommand> = new Map<string, KeyCommand>([
  ['ArrowLeft', { kind: 'step', delta: -1 }],
  ['ArrowRight', { kind: 'step', delta: 1 }],
])

const hasModifier = (press: KeyPress): boolean => press.ctrl || press.meta || press.alt

function gridKey(press: KeyPress, context: KeyContext): KeyAction | null {
  if (!context.inGrid || context.gridReadOnly || hasModifier(press)) return null
  const found = GRID_KEYS.get(press.key)
  return found === undefined ? null : { command: found, preventDefault: true }
}

function historyKey(press: KeyPress, context: KeyContext): KeyAction | null {
  if (!context.canUndo || press.alt) return null
  const key = press.key.toLowerCase()
  const found = HISTORY_KEYS.find(
    (entry) => entry.key === key && (entry.shift === null || entry.shift === press.shift),
  )
  return found === undefined ? null : { command: found.command, preventDefault: true }
}

function stickyKey(press: KeyPress, context: KeyContext): KeyAction | null {
  if (!context.canSticky || press.alt || context.typing) return null
  if (press.key.toLowerCase() === STICKY_KEY) {
    return { command: { kind: 'toggleSticky' }, preventDefault: true }
  }
  if (press.key === RELEASE_KEY && context.stickyLocked) {
    return { command: { kind: 'releaseSticky' }, preventDefault: false }
  }
  return null
}

function walkthroughKey(press: KeyPress, context: KeyContext): KeyAction | null {
  if (!context.walkthrough || press.alt || press.shift) return null
  const found = WALKTHROUGH_KEYS.get(press.key)
  return found === undefined ? null : { command: found, preventDefault: true }
}

/** Page-wide keys, which stay out of the way of an open dialog. */
function pageKey(press: KeyPress, context: KeyContext): KeyAction | null {
  if (context.dialogOpen) return null
  if (press.ctrl || press.meta) return historyKey(press, context)
  return stickyKey(press, context) ?? walkthroughKey(press, context)
}

/** What a keydown does, the focused cell's meaning first and the page's after, as the event bubbles. */
export const keymap = (press: KeyPress, context: KeyContext): KeyAction[] =>
  [gridKey(press, context), pageKey(press, context)].filter((action) => action !== null)
