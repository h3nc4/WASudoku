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

import { iconHref, type IconName } from '../components-next/icons'
import { TOAST_ACTIONS } from '../core/text/messages'

// A polite live region of status toasts in a manual popover, in the top layer without light dismiss.
// Content outside an open modal is inert even there, and the region moves into the open dialog.

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastAction {
  readonly label: string
  readonly run: () => void
}

export interface ToastOptions {
  /** A toast with the id of one on screen replaces it. */
  readonly id?: string
  /** Draws the tone's status icon before the message. A toast without one has no icon. */
  readonly tone?: ToastTone
  /** Milliseconds on screen, or Infinity for a toast that stays until its close button. */
  readonly duration?: number
  readonly action?: ToastAction
}

export interface Toaster {
  readonly show: (message: string, options?: ToastOptions) => HTMLElement
  readonly dismiss: (id: string) => void
  /** Moves the region into the open modal dialog, or back to the body, and on top of the layer. */
  readonly raise: () => void
  readonly dispose: () => void
}

export interface ToasterOptions {
  /** The query for the wide layout, where toasts sit bottom right instead of bottom centre. */
  readonly wide?: MediaQueryList
}

/** Sonner's default, which today's toasts use. */
export const TOAST_DURATION_MS = 4000
/** Sonner unmounts a leaving toast this long after its exit starts, under any motion setting. */
export const TOAST_UNMOUNT_MS = 200
/** Sonner draws the newest three of a stack and keeps the rest transparent. */
export const VISIBLE_TOASTS = 3
/** Sonner's gap between spread toasts, also the step of a collapsed stack in controls.css. */
export const TOAST_GAP_PX = 14
export const WIDE_QUERY = '(min-width: 768px)'
/** On a phone a toast keeps this far above the top of the steps panel once the panel is in view. */
export const FLOOR_GAP_PX = 12
const FLOOR_SELECTOR = '[data-toast-floor]'

const SVG = 'http://www.w3.org/2000/svg'

const TONE_ICONS: Readonly<Record<ToastTone, IconName>> = {
  success: 'toast-success',
  error: 'toast-error',
  info: 'toast-info',
}

function icon(doc: Document, name: IconName, className: string): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg')
  svg.setAttribute('class', className)
  svg.setAttribute('aria-hidden', 'true')
  const use = doc.createElementNS(SVG, 'use')
  use.setAttribute('href', iconHref(name))
  svg.append(use)
  return svg
}

function toneIcon(doc: Document, tone: ToastTone): HTMLSpanElement {
  const box = doc.createElement('span')
  box.className = 'toast-icon'
  box.append(icon(doc, TONE_ICONS[tone], 'toast-glyph'))
  return box
}

function button(doc: Document, className: string, onClick: () => void): HTMLButtonElement {
  const element = doc.createElement('button')
  element.type = 'button'
  element.className = className
  element.addEventListener('click', onClick)
  return element
}

/** A toast's box with its own content, scaled as the stack draws it, which is what sonner records. */
function boxHeight(item: HTMLElement): number {
  const forced = item.style.height
  item.style.height = 'auto'
  const { height } = item.getBoundingClientRect()
  item.style.height = forced
  return height
}

/** Pixels of the viewport the steps panel covers from the bottom edge, or 0 while it is hidden. */
function floorRise(doc: Document): number {
  const floor = doc.querySelector(FLOOR_SELECTOR)
  if (!floor || floor.getClientRects().length === 0) return 0
  return Math.ceil(globalThis.innerHeight - floor.getBoundingClientRect().top)
}

export function createToaster(host: HTMLElement, options: ToasterOptions = {}): Toaster {
  const doc = host.ownerDocument
  const wide = options.wide ?? globalThis.matchMedia(WIDE_QUERY)
  const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>()
  const unmounts = new WeakMap<Element, ReturnType<typeof setTimeout>>()
  const durations = new WeakMap<Element, number>()
  const controller = new AbortController()
  const { signal } = controller
  const hold = { pointer: false, focus: false }
  // Sonner's height record, newest first. Its first entry sizes every toast behind the front one.
  let heights: { readonly item: Element; readonly height: number }[] = []

  const items = () =>
    [...host.children].filter((child): child is HTMLElement => child instanceof HTMLElement)

  // Newest first, as sonner orders them. A leaving toast keeps its place until it unmounts.
  // Spread out, a toast rises by the recorded heights ahead of it in the record, as in sonner.
  const arrange = () => {
    const list = items()
    list.forEach((item, index) => {
      const at = Math.max(
        0,
        heights.findIndex((known) => known.item === item),
      )
      const ahead = heights.slice(0, at).reduce((sum, known) => sum + known.height, 0)
      item.style.setProperty('--index', String(index))
      item.style.setProperty('--offset', `${String(at * TOAST_GAP_PX + ahead)}px`)
      item.style.zIndex = String(list.length - index)
      item.toggleAttribute('data-behind', index > 0)
      item.toggleAttribute('data-buried', index >= VISIBLE_TOASTS)
    })
    host.style.setProperty('--front-height', `${String(heights[0]?.height ?? 0)}px`)
  }

  const record = (item: HTMLElement) => {
    const entry = { item, height: boxHeight(item) }
    heights = heights.some((known) => known.item === item)
      ? heights.map((known) => (known.item === item ? entry : known))
      : [entry, ...heights]
  }

  const place = () => {
    const rise = wide.matches ? 0 : floorRise(doc)
    if (rise > 0) host.style.setProperty('--toast-lift', `${String(rise + FLOOR_GAP_PX)}px`)
    else host.style.removeProperty('--toast-lift')
  }

  const raise = () => {
    // The app opens dialogs only through showModal(), so an open one is the modal.
    const parent = doc.querySelector('dialog[open]') ?? doc.body
    if (host.parentElement !== parent) parent.append(host)
    // Showing again puts the list above a dialog opened after it.
    host.hidePopover()
    if (host.childElementCount > 0) host.showPopover()
  }

  const stop = (item: Element) => {
    clearTimeout(timers.get(item))
    timers.delete(item)
  }

  const remove = (item: HTMLElement) => {
    unmounts.delete(item)
    item.remove()
    heights = heights.filter((known) => known.item !== item)
    arrange()
    if (host.childElementCount === 0) host.hidePopover()
  }

  const leave = (item: HTMLElement) => {
    stop(item)
    item.dataset['leaving'] = ''
    if (unmounts.has(item)) return
    unmounts.set(
      item,
      setTimeout(() => {
        remove(item)
      }, TOAST_UNMOUNT_MS),
    )
  }

  const start = (item: HTMLElement) => {
    stop(item)
    const duration = durations.get(item)
    if (hold.pointer || hold.focus || unmounts.has(item) || !Number.isFinite(duration)) return
    timers.set(
      item,
      setTimeout(() => {
        leave(item)
      }, duration),
    )
  }

  // A stack under the pointer or holding focus spreads out and pauses every timer, as sonner's does.
  const holdStack = (reason: keyof typeof hold, on: boolean) => {
    hold[reason] = on
    host.toggleAttribute('data-expanded', hold.pointer || hold.focus)
    for (const item of items()) {
      if (on) stop(item)
      else start(item)
    }
  }
  host.addEventListener(
    'pointerenter',
    () => {
      holdStack('pointer', true)
    },
    { signal },
  )
  host.addEventListener(
    'pointerleave',
    () => {
      holdStack('pointer', false)
    },
    { signal },
  )
  host.addEventListener(
    'focusin',
    () => {
      holdStack('focus', true)
    },
    { signal },
  )
  host.addEventListener(
    'focusout',
    (event) => {
      if (event.relatedTarget instanceof Node && host.contains(event.relatedTarget)) return
      holdStack('focus', false)
    },
    { signal },
  )

  const create = (id: string | undefined): HTMLElement => {
    const item = doc.createElement('div')
    item.setAttribute('role', 'status')
    item.setAttribute('aria-atomic', 'true')
    if (id !== undefined) item.dataset['id'] = id
    host.prepend(item)
    return item
  }

  const find = (id: string) => items().find((child) => child.dataset['id'] === id)

  const show = (message: string, toast: ToastOptions = {}): HTMLElement => {
    const { id, tone, duration = TOAST_DURATION_MS, action } = toast
    const shown = (id === undefined ? undefined : find(id)) ?? create(id)
    stop(shown)
    clearTimeout(unmounts.get(shown))
    unmounts.delete(shown)
    delete shown.dataset['leaving']
    shown.className = 'toast'
    delete shown.dataset['tone']
    const parts: Element[] = []
    if (tone !== undefined) {
      shown.dataset['tone'] = tone
      parts.push(toneIcon(doc, tone))
    }
    const text = doc.createElement('span')
    text.className = 'toast-message'
    text.textContent = message
    parts.push(text)
    if (action) {
      const run = button(doc, 'toast-action', () => {
        action.run()
        leave(shown)
      })
      run.textContent = action.label
      parts.push(run)
    }
    const persistent = !Number.isFinite(duration)
    if (persistent) {
      const close = button(doc, 'toast-close', () => {
        leave(shown)
      })
      close.setAttribute('aria-label', TOAST_ACTIONS.close)
      close.append(icon(doc, 'x', 'icon'))
      parts.push(close)
    }
    shown.replaceChildren(...parts)
    durations.set(shown, duration)
    raise()
    record(shown)
    arrange()
    place()
    start(shown)
    return shown
  }

  // Sonner remounts its list when the layout flips its position. That shows a leaving toast again
  // until it unmounts, restarts every other timer and records the heights again, oldest first.
  wide.addEventListener(
    'change',
    () => {
      heights = []
      for (const item of items()) {
        delete item.dataset['leaving']
        start(item)
        record(item)
      }
      arrange()
      place()
    },
    { signal },
  )
  const resize = new ResizeObserver(place)
  resize.observe(doc.body)
  globalThis.addEventListener('scroll', place, { passive: true, signal })
  globalThis.addEventListener('resize', place, { signal })

  doc.addEventListener(
    'toggle',
    (event) => {
      if (event.target instanceof HTMLDialogElement) raise()
    },
    { capture: true, signal },
  )
  doc.addEventListener(
    'close',
    (event) => {
      if (event.target instanceof HTMLDialogElement && event.target.contains(host)) raise()
    },
    { capture: true, signal },
  )

  return {
    show,
    dismiss: (id) => {
      const item = find(id)
      if (item) leave(item)
    },
    raise,
    dispose: () => {
      controller.abort()
      resize.disconnect()
      for (const child of host.children) {
        stop(child)
        clearTimeout(unmounts.get(child))
      }
    },
  }
}
