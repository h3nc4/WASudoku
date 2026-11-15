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

import { padTones } from '../components/controls'
import { padLabel } from '../components/view'
import { type PadKey, selectPad, toDigit } from '../core/game/selectors'
import { watch } from '../runtime/signals'
import type { Store } from '../runtime/store'
import {
  all,
  closestTo,
  Disposer,
  required,
  setAttr,
  setFlag,
  setHidden,
  setText,
  shallowEqual,
} from './dom'

/** Every tone padTones gives. A key removes them all before it adds the next one. */
const TONES = [
  'text-disabled-foreground',
  'text-primary-foreground',
  'text-ink',
  'text-muted-foreground',
]

function tone(element: Element, next: string): void {
  if (element.classList.contains(next)) return
  element.classList.remove(...TONES)
  element.classList.add(next)
}

export const samePadKey = (a: PadKey | undefined, b: PadKey | undefined): boolean =>
  a === undefined || b === undefined ? a === b : shallowEqual(a, b)

/** Draws one key, or nothing for a key the pad lacks, which never happens with nine. */
export function drawKey(button: HTMLButtonElement, key: PadKey | undefined): void {
  if (key === undefined) return
  const digit = required(button, '.pad-strike', HTMLElement)
  const count = required(button, '[data-count]', HTMLElement)
  const tones = padTones({ ...key, label: '' }, key.locked)
  button.disabled = key.disabled
  setAttr(button, 'aria-label', padLabel(key.digit, key.remaining))
  // A locked key is drawn filled, as the sticky toggle is.
  setAttr(button, 'data-variant', key.locked ? 'primary' : 'paper')
  setAttr(button, 'aria-pressed', key.pressed === null ? undefined : String(key.pressed))
  setFlag(digit, 'data-struck', key.remaining === 0)
  tone(digit, tones.digit)
  tone(count, tones.count)
  setText(count, String(key.remaining))
  setHidden(count, key.remaining === 0)
}

/** Binds the on-screen number pad to the count each key has left and to the sticky lock. */
export function bindPad(doc: Document, store: Store): () => void {
  const pad = required(doc, '#number-pad', HTMLElement)
  const disposer = new Disposer()
  for (const [index, button] of all(pad, 'button[data-digit]', HTMLButtonElement).entries()) {
    const key = store.select((state) => selectPad(state)[index], samePadKey)
    disposer.add(
      watch(() => {
        drawKey(button, key())
      }),
    )
  }
  disposer.on(pad, 'click', (event) => {
    const button = closestTo(event, '[data-digit]')
    const digit = toDigit(Number(button?.getAttribute('data-digit')))
    if (digit !== null) store.dispatch({ type: 'pad', digit })
  })
  return disposer.dispose
}
