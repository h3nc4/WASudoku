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

import {
  isDifficulty,
  type OfferView,
  selectOffer,
  selectSeconds,
  selectWin,
  type WinView,
} from '../core/game/selectors'
import { winSummary } from '../core/text/labels'
import { watch } from '../runtime/signals'
import type { Store } from '../runtime/store'
import { bindDialog, type DialogHandle } from './dialog'
import { Disposer, required, setText, shallowEqual } from './dom'

/** The value of each confirm dialog's action button. */
export const CONFIRM = 'confirm'

export type GameEvent = Parameters<Store['dispatch']>[0]

export interface Dialogs {
  /** Asks before an event that abandons the game in play, and dispatches it on confirm. */
  readonly confirmAbandon: (event: GameEvent) => void
  readonly confirmReveal: () => void
  readonly dispose: () => void
}

const sameOrNull =
  <T extends object>() =>
  (a: T | null, b: T | null): boolean =>
    a === null || b === null ? a === b : shallowEqual(a, b)

/** The win, abandon, reveal and shared puzzle dialogs. Each result goes to the store once it closes. */
export function bindDialogs(doc: Document, store: Store, onOpen: () => void): Dialogs {
  const dialog = (id: string) => required(doc, `#${id}`, HTMLDialogElement)
  const disposer = new Disposer()
  const handle = (id: string, onClose: (value: string) => void): DialogHandle => {
    const bound = bindDialog(dialog(id), { onOpen, onClose })
    disposer.add(bound.dispose)
    return bound
  }

  let abandoned: GameEvent | null = null
  const abandon = handle('abandon-dialog', (value) => {
    const event = abandoned
    abandoned = null
    if (value === CONFIRM && event !== null) store.dispatch(event)
  })
  const reveal = handle('reveal-dialog', (value) => {
    if (value === CONFIRM) store.dispatch({ type: 'solve' })
  })

  const summary = required(doc, '#win-summary', HTMLElement)
  const win = handle('win-dialog', (value) => {
    if (isDifficulty(value)) store.dispatch({ type: 'newGame', difficulty: value })
  })
  const won = store.select(selectWin, sameOrNull<WinView>())
  const seconds = store.select(selectSeconds)
  disposer.add(
    watch(() => {
      const current = won()
      if (current === null) {
        win.close()
        return
      }
      setText(summary, winSummary(current.difficulty, seconds(), current.mistakes))
      win.open()
    }),
  )

  // Accepting reads the offer from the state. One close dispatches one event, never a decline first.
  const offered = store.select(selectOffer, sameOrNull<OfferView>())
  const pending = handle('pending-dialog', (value) => {
    if (offered() === null) return
    store.dispatch({ type: value === CONFIRM ? 'acceptOffer' : 'declineOffer' })
  })
  disposer.add(
    watch(() => {
      if (offered() === null) pending.close()
      else pending.open()
    }),
  )

  return {
    confirmAbandon: (event) => {
      abandoned = event
      abandon.open()
    },
    confirmReveal: reveal.open,
    dispose: disposer.dispose,
  }
}
