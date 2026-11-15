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

import { fromKey } from '../core/game/events'
import { type GameKeyContext, selectKeyContext } from '../core/game/selectors'
import { type KeyContext, keymap, type KeyPress } from '../core/keymap'
import type { Store } from './store'

const GRID_CELL = '[role="gridcell"]'
const OPEN_DIALOG = 'dialog[open]'
/** Input types that take no characters, so a focused radio or checkbox still passes S on. */
const UNTYPED_INPUTS: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

/** A field that takes typing keeps its letters, while a read-only one passes them on. */
const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLInputElement && !target.readOnly && !UNTYPED_INPUTS.has(target.type)) ||
  (target instanceof HTMLElement && target.isContentEditable)

const inGrid = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(GRID_CELL) !== null

export const pressOf = (event: KeyboardEvent): KeyPress => ({
  key: event.key,
  ctrl: event.ctrlKey,
  meta: event.metaKey,
  alt: event.altKey,
  shift: event.shiftKey,
})

const sameContext = (a: GameKeyContext, b: GameKeyContext): boolean =>
  a.gridReadOnly === b.gridReadOnly &&
  a.canUndo === b.canUndo &&
  a.canSticky === b.canSticky &&
  a.stickyLocked === b.stickyLocked &&
  a.walkthrough === b.walkthrough

/** One keydown listener for the page. It returns the function that removes it. */
export function bindKeyboard(page: Document, store: Store): () => void {
  const game = store.select(selectKeyContext, sameContext)
  const listener = (event: KeyboardEvent): void => {
    if (event.isComposing) return
    const context: KeyContext = {
      ...game(),
      typing: isTyping(event.target),
      inGrid: inGrid(event.target),
      dialogOpen: page.querySelector(OPEN_DIALOG) !== null,
    }
    for (const action of keymap(pressOf(event), context)) {
      if (action.preventDefault) event.preventDefault()
      store.dispatch(fromKey(action.command))
    }
  }
  page.addEventListener('keydown', listener)
  return () => {
    page.removeEventListener('keydown', listener)
  }
}
