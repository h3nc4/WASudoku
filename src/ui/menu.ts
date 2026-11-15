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

// An APG menu button over a native auto popover, which already gives the top layer, Esc and
// light dismiss. This adds the keys, the expanded state, focus return and old-engine placement.

const ITEM = '[role="menuitem"]:not([aria-disabled="true"]):not(:disabled)'
/** Matches the 4px top margin of `.menu`. */
export const MENU_GAP_PX = 4
/** The closest a placed menu comes to the viewport's edge. */
export const MENU_EDGE_PX = 8

export interface Box {
  readonly top: number
  readonly left: number
  readonly right: number
  readonly bottom: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

/** The menu's alignment to its button, centred unless `data-align` gives an edge, as in CSS. */
export type Align = 'start' | 'center' | 'end'

const HALF = 2

const TRY_FALLBACKS = 'position-try-fallbacks'
/** The `.menu` fallback in controls.css, listed twice so it differs from that value and acts the same. */
const REFIT_FALLBACKS = 'flip-block, flip-block'

const ALIGNED: Readonly<Record<Align, (anchor: Box, width: number) => number>> = {
  start: (anchor) => anchor.left,
  center: (anchor, width) => (anchor.left + anchor.right - width) / HALF,
  end: (anchor, width) => anchor.right - width,
}

export const alignOf = (value: string | undefined): Align =>
  value === 'start' || value === 'end' ? value : 'center'

export interface Placement {
  readonly top: number
  readonly left: number
}

/** Where a menu goes without anchor positioning: below its button, or above it when only that fits. */
export function placeMenu(anchor: Box, menu: Size, viewport: Size, align: Align): Placement {
  const below = anchor.bottom + MENU_GAP_PX
  const above = anchor.top - MENU_GAP_PX - menu.height
  const fitsBelow = below + menu.height <= viewport.height - MENU_EDGE_PX
  const top = fitsBelow || above < MENU_EDGE_PX ? below : above
  const start = ALIGNED[align](anchor, menu.width)
  const maxLeft = Math.max(MENU_EDGE_PX, viewport.width - menu.width - MENU_EDGE_PX)
  return { top, left: Math.min(Math.max(start, MENU_EDGE_PX), maxLeft) }
}

/** The key a menu reacts to, as read off a keydown. */
export interface MenuKey {
  readonly key: string
  readonly modified: boolean
}

const PRINTABLE = /^\S$/u

// The item a key moves to from the focused one, or null for a key the menu leaves alone.
// Arrows wrap, and a letter cycles through the items it starts.
export function menuTarget(press: MenuKey, labels: readonly string[], at: number): number | null {
  const last = labels.length - 1
  if (last < 0 || press.modified) return null
  switch (press.key) {
    case 'ArrowDown':
      return at >= last ? 0 : at + 1
    case 'ArrowUp':
      return at <= 0 ? last : at - 1
    case 'Home':
      return 0
    case 'End':
      return last
  }
  if (!PRINTABLE.test(press.key)) return null
  const letter = press.key.toLowerCase()
  const order = labels.map((_, k) => (at + 1 + k) % labels.length)
  return order.find((k) => labels[k]?.trim().toLowerCase().startsWith(letter) === true) ?? null
}

export interface MenuOptions {
  /** False places the menu from script. Defaults to whether CSS anchor positioning works. */
  readonly anchored?: boolean
}

export interface MenuHandle {
  readonly invoker: HTMLElement
  readonly close: () => void
  readonly dispose: () => void
}

export const supportsAnchors = (): boolean =>
  'CSS' in globalThis && CSS.supports('anchor-name', '--a')

/** Wires a `[popover][role=menu]` to the button whose `popovertarget` names it. */
export function bindMenu(menu: HTMLElement, options: MenuOptions = {}): MenuHandle {
  const doc = menu.ownerDocument
  const invoker = doc.querySelector<HTMLElement>(`[popovertarget="${menu.id}"]`)
  if (!invoker) throw new Error(`No button opens the menu #${menu.id}`)
  const anchored = options.anchored ?? supportsAnchors()
  const controller = new AbortController()
  const { signal } = controller
  const items = () => [...menu.querySelectorAll<HTMLElement>(ITEM)]
  let open = false
  let openAtEnd = false
  // The inline style from before placing, put back on close.
  let unplaced: string | null = null

  const close = () => {
    if (open) menu.hidePopover()
  }

  // Native focus return skips a button that took no focus on press, as the controls keep the cell.
  const closeToInvoker = () => {
    if (!open) return
    invoker.focus()
    menu.hidePopover()
  }

  const place = () => {
    const { clientWidth, clientHeight } = doc.documentElement
    // The layout size, since the entry transition scales the box getBoundingClientRect reads.
    const spot = placeMenu(
      invoker.getBoundingClientRect(),
      { width: menu.offsetWidth, height: menu.offsetHeight },
      { width: clientWidth, height: clientHeight },
      alignOf(menu.dataset['align']),
    )
    menu.style.setProperty('inset', 'auto')
    menu.style.setProperty('margin', '0')
    menu.style.setProperty('position-area', 'none')
    menu.style.setProperty(TRY_FALLBACKS, 'none')
    menu.style.setProperty('top', `${String(spot.top)}px`)
    menu.style.setProperty('left', `${String(spot.left)}px`)
    menu.style.removeProperty('visibility')
  }

  // CSS keeps the last fallback that fit until it overflows, so a menu flipped above stays there
  // when the window grows. Each resize swaps between two spellings of the flip, and either resets it.
  const refit = () => {
    if (menu.style.getPropertyValue(TRY_FALLBACKS) === '') {
      menu.style.setProperty(TRY_FALLBACKS, REFIT_FALLBACKS)
    } else {
      menu.style.removeProperty(TRY_FALLBACKS)
    }
  }

  const unplace = () => {
    if (unplaced === null) menu.removeAttribute('style')
    else menu.setAttribute('style', unplaced)
  }

  // The menu is measured once shown. It is hidden for the frame between showing and placing.
  menu.addEventListener(
    'beforetoggle',
    (event) => {
      if (anchored || event.newState !== 'open') return
      unplaced = menu.getAttribute('style')
      menu.style.setProperty('visibility', 'hidden')
    },
    { signal },
  )

  menu.addEventListener(
    'toggle',
    (event) => {
      open = event.newState === 'open'
      invoker.setAttribute('aria-expanded', String(open))
      if (!open) {
        if (anchored) menu.style.removeProperty(TRY_FALLBACKS)
        else unplace()
        return
      }
      if (!anchored) place()
      const list = items()
      const first = openAtEnd ? list.at(-1) : list[0]
      openAtEnd = false
      first?.focus()
    },
    { signal },
  )

  globalThis.addEventListener(
    'resize',
    () => {
      if (open && anchored) refit()
    },
    { signal },
  )

  invoker.addEventListener(
    'keydown',
    (event) => {
      if (open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
      event.preventDefault()
      openAtEnd = event.key === 'ArrowUp'
      invoker.click()
    },
    { signal },
  )

  menu.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Tab') {
        close()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        closeToInvoker()
        return
      }
      const list = items()
      const at = list.findIndex((item) => item === doc.activeElement)
      const modified = event.ctrlKey || event.metaKey || event.altKey
      const next = menuTarget(
        { key: event.key, modified },
        list.map((item) => item.textContent),
        at,
      )
      if (next === null) return
      event.preventDefault()
      list[next]?.focus()
    },
    { signal },
  )

  menu.addEventListener(
    'click',
    (event) => {
      if (event.target instanceof Element && event.target.closest(ITEM)) closeToInvoker()
    },
    { signal },
  )

  return {
    invoker,
    close,
    dispose: () => {
      controller.abort()
    },
  }
}
