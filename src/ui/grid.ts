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

import {
  type GridView,
  selectCells,
  selectGrid,
  selectMode,
  selectSelection,
  toCellIndex,
} from '../core/game/selectors'
import { watch } from '../runtime/signals'
import type { Store } from '../runtime/store'
import { cellContent, contentKey, drawnCell, sameDrawn, stateAttributes } from './cells'
import {
  all,
  closestTo,
  Disposer,
  positionOf,
  required,
  setAttr,
  setFlag,
  setHidden,
  shallowEqual,
} from './dom'

// Roving tabindex for the role=grid board, with one cell in the tab order and Home and End keys.
// The arrows belong to the core keymap, because they move the game's selection.

/** Cells per row of the board. */
export const GRID_SIZE = 9
export const GRID_CELLS = GRID_SIZE * GRID_SIZE

/** Keyframe sets the conflict pulse alternates between. */
const PULSE_KEYFRAMES = 2

export interface GridKey {
  readonly key: string
  readonly ctrl: boolean
  readonly meta: boolean
  readonly alt: boolean
  readonly shift: boolean
}

/** The cell a key moves to from `index`, or null for a key the grid leaves to the keymap. */
export function gridTarget(index: number, press: GridKey): number | null {
  if (press.alt || press.shift || press.meta) return null
  const rowStart = index - (index % GRID_SIZE)
  switch (press.key) {
    case 'Home':
      return press.ctrl ? 0 : rowStart
    case 'End':
      return press.ctrl ? GRID_CELLS - 1 : rowStart + GRID_SIZE - 1
    default:
      return null
  }
}

export interface GridOptions {
  /** Focus reached a cell, by Tab, a pointer or a Home or End key. */
  readonly onSelect: (index: number) => void
  /** Focus left the board for somewhere else on the page. */
  readonly onLeave?: () => void
}

export interface GridHandle {
  /** The cell holding the tab stop. */
  readonly active: () => number
  /** Moves the tab stop, as the selection changes without focus. */
  readonly setActive: (index: number) => void
  /** Moves the tab stop and focus to a cell the game already selected, without calling onSelect. */
  readonly focus: (index: number) => void
  readonly dispose: () => void
}

/** Binds a `[role=grid]` whose cells are its `[role=gridcell]` descendants in reading order. */
export function bindGrid(grid: HTMLElement, options: GridOptions): GridHandle {
  const cells = [...grid.querySelectorAll<HTMLElement>('[role="gridcell"]')]
  const controller = new AbortController()
  const { signal } = controller
  let active = Math.max(
    0,
    cells.findIndex((cell) => cell.tabIndex === 0),
  )
  let quiet = false

  const indexOf = (target: EventTarget | null): number => {
    const cell = target instanceof Element ? target.closest('[role="gridcell"]') : null
    return positionOf(cells, cell)
  }

  const setActive = (index: number) => {
    const next = cells[index]
    if (!next) return
    for (const [k, cell] of cells.entries()) cell.tabIndex = k === index ? 0 : -1
    active = index
  }

  const focus = (index: number) => {
    setActive(index)
    quiet = true
    cells[index]?.focus()
    quiet = false
  }

  grid.addEventListener(
    'keydown',
    (event) => {
      const at = indexOf(event.target)
      if (at < 0) return
      const press = {
        key: event.key,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
        shift: event.shiftKey,
      }
      const next = gridTarget(at, press)
      if (next === null) return
      event.preventDefault()
      focus(next)
      options.onSelect(next)
    },
    { signal },
  )

  grid.addEventListener(
    'focusin',
    (event) => {
      const at = indexOf(event.target)
      if (at < 0 || quiet) return
      setActive(at)
      options.onSelect(at)
    },
    { signal },
  )

  // Read once focus has settled. A window losing focus keeps the cell active, and that is no leave.
  grid.addEventListener(
    'focusout',
    () => {
      setTimeout(() => {
        if (!signal.aborted && !grid.contains(grid.ownerDocument.activeElement)) options.onLeave?.()
      })
    },
    { signal },
  )

  return {
    active: () => active,
    setActive,
    focus,
    dispose: () => {
      controller.abort()
    },
  }
}

const CELL = '[role="gridcell"]'

/** Each clash swaps between two identical keyframes, so a repeat clash restarts the pulse. */
export const pulseKeyframes = (pulse: number | null): 'a' | 'b' | undefined => {
  if (pulse === null) return undefined
  return pulse % PULSE_KEYFRAMES === 0 ? 'b' : 'a'
}

/** A field that takes typing keeps its paste. */
const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable)

/** Draws the store's board into the 81 cells, writing only the cells and attributes that changed. */
export function bindBoard(doc: Document, store: Store): () => void {
  const board = required(doc, '#board', HTMLElement)
  const overlay = required(doc, '#pause-overlay', HTMLElement)
  const cells = all(board, CELL, HTMLElement)
  const disposer = new Disposer()
  const select = (index: number | null) => {
    store.dispatch({ type: 'select', index: index === null ? null : toCellIndex(index) })
  }
  const grid = bindGrid(board, {
    onSelect: select,
    onLeave: () => {
      select(null)
    },
  })
  disposer.add(grid.dispose)

  for (const [index, element] of cells.entries()) {
    const view = store.select(
      (state) => drawnCell(selectCells(state)[index], selectMode(state) === 'walkthrough'),
      sameDrawn,
    )
    let drawn: string | null = null
    disposer.add(
      watch(() => {
        const cell = view()
        for (const [name, value] of stateAttributes(index, cell)) setAttr(element, name, value)
        const key = contentKey(cell)
        if (key === drawn) return
        drawn = key
        element.replaceChildren(...cellContent(doc, cell))
      }),
    )
  }

  const selection = store.select(selectSelection)
  disposer.add(
    watch(() => {
      const index = selection()
      if (index === null) return
      // A move by arrow key keeps focus with the selection, and a selection made elsewhere only moves the tab stop.
      if (board.contains(doc.activeElement)) grid.focus(index)
      else grid.setActive(index)
    }),
  )

  const view = store.select(selectGrid, shallowEqual<GridView>)
  disposer.add(
    watch(() => {
      const { paused, solving, readOnly, pulse } = view()
      setFlag(board, 'data-paused', paused)
      setAttr(board, 'data-pulse', pulseKeyframes(pulse))
      setAttr(board, 'aria-busy', solving ? 'true' : undefined)
      setAttr(board, 'aria-readonly', readOnly ? 'true' : undefined)
      setHidden(overlay, !paused)
    }),
  )

  disposer.on(board, 'click', (event) => {
    const cell = closestTo(event, CELL)
    const index = positionOf(cells, cell)
    const at = toCellIndex(index)
    if (at !== null) store.dispatch({ type: 'tap', index: at })
  })
  disposer.on(required(doc, '#resume-button', HTMLElement), 'click', () => {
    store.dispatch({ type: 'resume' })
  })
  // Reading the event's own data avoids the clipboard permission prompt.
  doc.addEventListener(
    'paste',
    (event) => {
      const text = event.clipboardData?.getData('text/plain') ?? ''
      if (isTyping(event.target) || doc.querySelector('dialog[open]') !== null || text === '')
        return
      event.preventDefault()
      store.dispatch({ type: 'paste', text })
    },
    { signal: disposer.signal },
  )
  return disposer.dispose
}
