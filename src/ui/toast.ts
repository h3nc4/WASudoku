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

import { TOAST_ACTIONS } from '../core/text/messages'

// A polite live list in a manual popover, which puts it in the top layer without light dismiss.
// Content outside an open modal is inert even there, and the list moves into the open dialog.

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastAction {
  readonly label: string
  readonly run: () => void
}

export interface ToastOptions {
  /** A toast with the id of one on screen replaces it. */
  readonly id?: string
  readonly tone?: ToastTone
  /** Milliseconds on screen, or Infinity for a toast that stays until its close button. */
  readonly duration?: number
  readonly action?: ToastAction
}

export interface Toaster {
  readonly show: (message: string, options?: ToastOptions) => HTMLLIElement
  readonly dismiss: (id: string) => void
  /** Moves the list into the open modal dialog, or back to the body, and on top of the layer. */
  readonly raise: () => void
  readonly dispose: () => void
}

export interface ToasterOptions {
  readonly reducedMotion?: () => boolean
}

/** Sonner's default, which today's toasts use. */
export const TOAST_DURATION_MS = 4000
/** The exit transition is 200ms, so this removes a toast whose transitionend never comes. */
export const TOAST_LEAVE_MS = 400

const SVG = 'http://www.w3.org/2000/svg'

const prefersReducedMotion = (): boolean =>
  globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches

function closeIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'icon')
  svg.setAttribute('aria-hidden', 'true')
  const use = doc.createElementNS(SVG, 'use')
  use.setAttribute('href', '#i-x')
  svg.append(use)
  return svg
}

function button(doc: Document, className: string, onClick: () => void): HTMLButtonElement {
  const element = doc.createElement('button')
  element.type = 'button'
  element.className = className
  element.addEventListener('click', onClick)
  return element
}

export function createToaster(host: HTMLElement, options: ToasterOptions = {}): Toaster {
  const doc = host.ownerDocument
  const reducedMotion = options.reducedMotion ?? prefersReducedMotion
  const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>()
  const durations = new WeakMap<Element, number>()
  const controller = new AbortController()
  const { signal } = controller

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
    if (!('leaving' in item.dataset)) return
    item.remove()
    if (host.childElementCount === 0) host.hidePopover()
  }

  const leave = (item: HTMLElement) => {
    stop(item)
    item.dataset['leaving'] = ''
    if (reducedMotion()) {
      remove(item)
      return
    }
    item.addEventListener(
      'transitionend',
      () => {
        remove(item)
      },
      { once: true },
    )
    setTimeout(() => {
      remove(item)
    }, TOAST_LEAVE_MS)
  }

  const start = (item: HTMLElement) => {
    stop(item)
    const duration = durations.get(item)
    if (!Number.isFinite(duration)) return
    timers.set(
      item,
      setTimeout(() => {
        leave(item)
      }, duration),
    )
  }

  const create = (id: string | undefined): HTMLLIElement => {
    const item = doc.createElement('li')
    if (id !== undefined) item.dataset['id'] = id
    // A toast under the pointer or holding focus pauses its timer, which keeps its button on screen.
    for (const type of ['pointerenter', 'focusin'] as const) {
      item.addEventListener(type, () => {
        stop(item)
      })
    }
    for (const type of ['pointerleave', 'focusout'] as const) {
      item.addEventListener(type, () => {
        start(item)
      })
    }
    host.append(item)
    return item
  }

  const find = (id: string) =>
    [...host.children].find(
      (child): child is HTMLLIElement =>
        child instanceof HTMLLIElement && child.dataset['id'] === id,
    )

  const show = (message: string, toast: ToastOptions = {}): HTMLLIElement => {
    const { id, tone = 'info', duration = TOAST_DURATION_MS, action } = toast
    const shown = (id === undefined ? undefined : find(id)) ?? create(id)
    stop(shown)
    delete shown.dataset['leaving']
    shown.className = 'toast'
    shown.dataset['tone'] = tone
    const text = doc.createElement('span')
    text.className = 'toast-message'
    text.textContent = message
    const parts: Element[] = [text]
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
      close.append(closeIcon(doc))
      parts.push(close)
    }
    shown.replaceChildren(...parts)
    durations.set(shown, duration)
    raise()
    start(shown)
    return shown
  }

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
      for (const child of host.children) stop(child)
    },
  }
}
