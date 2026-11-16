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

import { asksForShortcuts } from '../runtime/keyboard'
import { bindDialog } from './dialog'
import { Disposer, required } from './dom'

export const SHORTCUTS_DIALOG = '#shortcuts-dialog'
export const SHORTCUTS_BUTTON = '#shortcuts-button'

/** Opens the shortcuts dialog from its header button and from the `?` key. */
export function bindShortcuts(doc: Document, onOpen: () => void): () => void {
  const disposer = new Disposer()
  const dialog = bindDialog(required(doc, SHORTCUTS_DIALOG, HTMLDialogElement), { onOpen })
  disposer.add(dialog.dispose)
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
