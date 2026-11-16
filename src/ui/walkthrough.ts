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

import { rowClass } from '../components/controls'
import { endRow, stepTag, type StepTone, stepTone, type TraceRow } from '../components/view'
import { selectWalkthrough, type Step, type WalkthroughView } from '../core/game/selectors'
import { explainPosition, solvedInText, traceText } from '../core/text/techniques'
import { watch } from '../runtime/signals'
import type { Store } from '../runtime/store'
import { closestTo, Disposer, required, setAttr, setHidden, setText } from './dom'

const sameWalk = (a: WalkthroughView | null, b: WalkthroughView | null): boolean =>
  a === null || b === null ? a === b : a.steps === b.steps && a.cursor === b.cursor

/** One trace row, as StepsPanel.astro renders it. */
export function traceRow(
  doc: Document,
  step: Step,
  position: number,
  total: number,
): HTMLLIElement {
  const item = doc.createElement('li')
  item.id = `solver-step-${String(position - 1)}`
  const button = doc.createElement('button')
  button.type = 'button'
  button.dataset['step'] = String(position)
  const { where, label } = traceText(step)
  const parts: [string, string][] = [
    ['sr-only', 'Step'],
    ['', stepTag(position, total)],
    ['whitespace-nowrap', where],
    ['min-w-0 break-words', label],
  ]
  for (const [k, [className, text]] of parts.entries()) {
    const span = doc.createElement('span')
    if (className !== '') span.className = className
    span.textContent = text
    if (k > 0) button.append(' ')
    button.append(span)
  }
  item.append(button)
  return item
}

const reducedMotion = (): boolean =>
  globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches

type Span = Pick<DOMRect, 'top' | 'bottom'>

/** Where the trace scrolls to show a row, its top without one, or null when nothing has to move. */
export function traceScroll(view: Span, row: Span | undefined, scrollTop: number): number | null {
  if (row === undefined) return scrollTop === 0 ? null : 0
  if (row.top < view.top) return scrollTop - (view.top - row.top)
  if (row.bottom > view.bottom) return scrollTop + row.bottom - view.bottom
  return null
}

function mark(button: HTMLElement, tone: StepTone | 'reached', current: boolean): void {
  const className = rowClass(tone)
  if (button.className !== className) button.className = className
  setAttr(button, 'aria-current', current ? 'step' : undefined)
}

/** Binds the steps panel to the walkthrough. A cursor move rewrites only the rows whose tone changed. */
export function bindWalkthrough(doc: Document, store: Store): () => void {
  const panel = required(doc, '#steps-panel', HTMLElement)
  const section = required(panel, 'section', HTMLElement)
  const count = required(panel, '#step-count', HTMLElement)
  const previous = required(panel, '#previous-step', HTMLButtonElement)
  const next = required(panel, '#next-step', HTMLButtonElement)
  const first = required(panel, '#step-start', HTMLElement)
  const last = required(panel, '#step-end', HTMLElement)
  const trace = required(panel, '#solver-trace', HTMLElement)
  const explanation = required(panel, '[data-explanation]', HTMLElement)
  const solvedIn = required(panel, '[data-solved-in]', HTMLElement)
  const disposer = new Disposer()
  let rows: HTMLElement[] = []
  let tones: StepTone[] = []
  let texts: readonly TraceRow[] = []
  let drawn: readonly Step[] | null = null

  const walk = store.select(selectWalkthrough, sameWalk)
  disposer.add(
    watch(() => {
      const view = walk()
      if (view === null) return
      const { steps, cursor, atStart, atEnd } = view
      const total = steps.length
      if (steps !== drawn) {
        drawn = steps
        const items = steps.map((step, k) => traceRow(doc, step, k + 1, total))
        trace.replaceChildren(...items)
        rows = items.map((item) => required(item, 'button', HTMLElement))
        tones = []
        texts = steps.map((step) => traceText(step))
        section.style.setProperty('--trace-tag', `${String(String(total).length)}ch`)
        last.dataset['step'] = String(total)
        setText(required(first, '[data-tag]', HTMLElement), stepTag(0, total))
      }
      const ends = { steps: texts, current: cursor, explanation: '' }
      for (const [k, row] of rows.entries()) {
        const tone = stepTone(k + 1, cursor)
        if (tones[k] === tone) continue
        tones[k] = tone
        mark(row, tone, tone === 'current')
      }
      const start = endRow(0, ends)
      const end = endRow(total, ends)
      mark(first, start.tone, start.current)
      mark(last, end.tone, end.current)
      setText(count, `${stepTag(cursor, total)}/${String(total)}`)
      previous.disabled = atStart
      next.disabled = atEnd
      setText(explanation, explainPosition(steps, cursor))
      setText(solvedIn, atEnd ? solvedInText(total) : '')
      setHidden(solvedIn, !atEnd)
      // Only the trace scrolls, since scrollIntoView would move the page too.
      const top = traceScroll(
        trace.getBoundingClientRect(),
        rows[cursor - 1]?.getBoundingClientRect(),
        trace.scrollTop,
      )
      if (top !== null) trace.scrollTo({ top, behavior: reducedMotion() ? 'instant' : 'smooth' })
    }),
  )

  disposer.on(panel, 'click', (event) => {
    const row = closestTo(event, '[data-step]')
    const cursor = Number(row?.dataset['step'] ?? Number.NaN)
    if (Number.isInteger(cursor)) store.dispatch({ type: 'viewStep', cursor })
  })
  disposer.on(previous, 'click', () => {
    store.dispatch({ type: 'step', delta: -1 })
  })
  disposer.on(next, 'click', () => {
    store.dispatch({ type: 'step', delta: 1 })
  })
  return disposer.dispose
}
