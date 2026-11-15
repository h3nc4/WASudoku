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

import { LAYOUT_CLASSES, SELECTING_CLASSES } from '../components-next/controls'
import { type Mode, selectMode } from '../core/game/selectors'
import { watch } from '../runtime/signals'
import type { Store } from '../runtime/store'
import { all, required, setAttr, setHidden } from './dom'

/** The action buttons each mode shows, in the order ActionRow.astro renders all of them. */
export const ACTIONS: Readonly<Record<Mode, readonly string[]>> = {
  selecting: ['solve-button', 'clear-button'],
  entering: ['start-button', 'clear-button'],
  playing: ['hint-button', 'solve-button', 'clear-button'],
  won: ['hint-button', 'solve-button', 'clear-button'],
  walkthrough: ['exit-button', 'clear-button'],
}

const ACTION_IDS = ['hint-button', 'solve-button', 'exit-button', 'start-button', 'clear-button']

/** Clear spans both columns when no hint button sits beside Solve. */
const WIDE = 'col-span-2'

const swap = (element: Element, from: string, to: string) => {
  element.classList.remove(...from.split(' '))
  element.classList.add(...to.split(' '))
}

/** What changes with the mode alone: the selection screen, the layout and which buttons show. */
export function bindLayout(doc: Document, store: Store): () => void {
  const main = required(doc, 'main', HTMLElement)
  const layout = required(doc, '#layout', HTMLElement)
  const selection = required(doc, '#selection-screen', HTMLElement)
  const steps = required(doc, '#steps-panel', HTMLElement)
  const scrollHint = required(doc, '#scroll-hint', HTMLElement)
  const newButton = required(doc, '#new-button', HTMLElement)
  const custom = all(doc, '#new-menu [data-custom]', HTMLElement)
  const actions = ACTION_IDS.map((id) => required(doc, `#${id}`, HTMLElement))
  const clear = required(doc, '#clear-button', HTMLElement)
  const mode = store.select(selectMode)

  return watch(() => {
    const current = mode()
    const selecting = current === 'selecting'
    const walkthrough = current === 'walkthrough'
    main.inert = selecting
    for (const name of SELECTING_CLASSES) main.classList.toggle(name, selecting)
    if (walkthrough) swap(layout, LAYOUT_CLASSES.play, LAYOUT_CLASSES.walkthrough)
    else swap(layout, LAYOUT_CLASSES.walkthrough, LAYOUT_CLASSES.play)
    setHidden(selection, !selecting)
    setHidden(steps, !walkthrough)
    setHidden(scrollHint, !walkthrough)
    for (const item of custom) {
      setHidden(item, selecting)
      if (item instanceof HTMLButtonElement) item.disabled = selecting
    }
    // Start Puzzle is the primary action while a puzzle is typed in.
    setAttr(newButton, 'data-variant', current === 'entering' ? 'paper' : 'primary')
    const shown = ACTIONS[current]
    for (const action of actions) setHidden(action, !shown.includes(action.id))
    clear.classList.toggle(WIDE, !shown.includes('hint-button'))
  })
}
