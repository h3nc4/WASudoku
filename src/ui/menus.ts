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

import { isDifficulty, selectControls } from '../core/game/selectors'
import { type Address, shareEvent } from '../runtime/share-link'
import type { Store } from '../runtime/store'
import type { GameEvent } from './dialogs'
import { closestTo, Disposer, required } from './dom'
import { bindMenu } from './menu'

/** The event a new-puzzle button stands for, from its data-difficulty or data-action. */
export function newPuzzleEvent(button: Element): GameEvent | null {
  const difficulty = button.getAttribute('data-difficulty')
  if (isDifficulty(difficulty)) return { type: 'newGame', difficulty }
  return button.getAttribute('data-action') === 'custom' ? { type: 'enterCustom' } : null
}

/** The share and new puzzle menus, and the selection screen's buttons. */
export function bindMenus(
  doc: Document,
  store: Store,
  address: Address,
  confirmAbandon: (event: GameEvent) => void,
): () => void {
  const disposer = new Disposer()
  const share = required(doc, '#share-menu', HTMLElement)
  const fresh = required(doc, '#new-menu', HTMLElement)
  disposer.add(bindMenu(share).dispose)
  disposer.add(bindMenu(fresh).dispose)

  disposer.on(share, 'click', (event) => {
    const action = closestTo(event, '[data-action]')?.getAttribute('data-action')
    if (action === 'copy-link') store.dispatch(shareEvent(address))
    if (action === 'copy-text') store.dispatch({ type: 'export' })
  })

  const controls = store.select(selectControls)
  disposer.on(fresh, 'click', (event) => {
    const item = closestTo(event, '[role="menuitem"]')
    const chosen = item === null ? null : newPuzzleEvent(item)
    if (chosen === null) return
    if (controls().confirmNewPuzzle) confirmAbandon(chosen)
    else store.dispatch(chosen)
  })

  disposer.on(required(doc, '#selection-screen', HTMLElement), 'click', (event) => {
    const button = closestTo(event, 'button')
    const chosen = button === null ? null : newPuzzleEvent(button)
    if (chosen !== null) store.dispatch(chosen)
  })
  return disposer.dispose
}
