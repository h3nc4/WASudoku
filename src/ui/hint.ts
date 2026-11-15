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

import { type Hint, selectHint, selectStatus } from '../core/game/selectors'
import { formatCell } from '../core/text/format'
import { HINT_LABELS, mistakeAnnouncement, SOLVED_ANNOUNCEMENT } from '../core/text/labels'
import { explainHint, type TraceText, traceText } from '../core/text/techniques'
import { watch } from '../runtime/signals'
import type { Store } from '../runtime/store'
import { Disposer, required, setFlag, setText } from './dom'

/** The cell a hint points at and its label, for the first line of the strip. */
export function hintLine(hint: Hint): TraceText {
  switch (hint.kind) {
    case 'step':
      return traceText(hint.step, false)
    case 'mistake':
      return { where: formatCell(hint.index), label: HINT_LABELS.mistake }
    case 'reveal':
      return { where: formatCell(hint.index), label: HINT_LABELS.reveal }
  }
}

/** The strip below the board, which keeps its last hint while it closes. */
export function bindHint(doc: Document, store: Store): () => void {
  const slot = required(doc, '#hint-slot', HTMLElement)
  const part = (name: string) => required(slot, `[data-hint="${name}"]`, HTMLElement)
  const where = part('where')
  const label = part('label')
  const text = part('text')
  const disposer = new Disposer()
  const hint = store.select(selectHint)
  disposer.add(
    watch(() => {
      const current = hint()
      const open = current !== null
      setFlag(slot, 'data-open', open)
      slot.inert = !open
      slot.setAttribute('aria-hidden', String(!open))
      if (current === null) return
      const line = hintLine(current)
      setText(where, line.where)
      setText(label, line.label)
      setText(text, explainHint(current))
    }),
  )
  disposer.on(required(slot, '#dismiss-hint', HTMLElement), 'click', () => {
    store.dispatch({ type: 'dismissHint' })
  })
  return disposer.dispose
}

/** Speaks hints, mistakes and the win through the page's one status region. */
export function bindAnnouncer(doc: Document, store: Store): () => void {
  const region = required(doc, '#announcer', HTMLElement)
  const disposer = new Disposer()
  const hint = store.select(selectHint)
  disposer.add(
    watch(() => {
      const current = hint()
      if (current !== null) region.textContent = explainHint(current)
    }),
  )
  const mistakes = store.select((state) => selectStatus(state)?.mistakes ?? 0)
  let last = mistakes()
  disposer.add(
    watch(() => {
      const count = mistakes()
      if (count > last) region.textContent = mistakeAnnouncement(count)
      last = count
    }),
  )
  const solved = store.select((state) => selectStatus(state)?.solved === true)
  let wasSolved = solved()
  disposer.add(
    watch(() => {
      const now = solved()
      if (now && !wasSolved) region.textContent = SOLVED_ANNOUNCEMENT
      wasSolved = now
    }),
  )
  return disposer.dispose
}
