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

// Roving tabindex for the role=grid board, with one cell in the tab order and Home and End keys.
// The arrows belong to the core keymap, because they move the game's selection.

/** Cells per row of the board. */
export const GRID_SIZE = 9
export const GRID_CELLS = GRID_SIZE * GRID_SIZE

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
    return cells.findIndex((candidate) => candidate === cell)
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
