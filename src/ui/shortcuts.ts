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

import { modifierName } from '../core/text/shortcuts'
import { asksForShortcuts } from '../runtime/keyboard'
import { bindDialog } from './dialog'
import { Disposer, required, setText } from './dom'

export const SHORTCUTS_DIALOG = '#shortcuts-dialog'
export const SHORTCUTS_BUTTON = '#shortcuts-button'

const APPLE = /Mac|iPhone|iPad|iPod/u

/** Whether a user agent runs on Apple's hardware, whose keyboards print Cmd. iPadOS reads as a Mac. */
export const isApple = (userAgent: string): boolean => APPLE.test(userAgent)

/** Opens the shortcuts dialog from its header button and from the `?` key. */
export function bindShortcuts(
  doc: Document,
  onOpen: () => void,
  apple = isApple(navigator.userAgent),
): () => void {
  const disposer = new Disposer()
  const element = required(doc, SHORTCUTS_DIALOG, HTMLDialogElement)
  const dialog = bindDialog(element, { onOpen })
  disposer.add(dialog.dispose)
  for (const cap of element.querySelectorAll('[data-modifier]')) setText(cap, modifierName(apple))
  disposer.on(required(doc, SHORTCUTS_BUTTON, HTMLElement), 'click', dialog.open)
  doc.addEventListener(
    'keydown',
    (event) => {
      if (!asksForShortcuts(doc, event)) return
      event.preventDefault()
      dialog.open()
    },
    { signal: disposer.signal },
  )
  return disposer.dispose
}
