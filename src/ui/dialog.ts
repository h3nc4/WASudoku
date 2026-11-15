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

// showModal() gives the top layer, the inert page, Esc and focus return. CSS locks the scroll
// through `html:has(dialog:modal)`. This adds the wrapped Tab, old-engine light dismiss and the result.

/** The result of a dialog closed by Esc or by a click outside it, which set an empty return value. */
export const DISMISSED = 'cancel'

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
const UNREACHABLE = '[hidden], [inert], [data-leaving]'

/** Where Tab goes from the stop at `at` of `count`, or null where the browser's own order is right. */
export function wrapTarget(count: number, at: number, back: boolean): number | null {
  if (count === 0) return null
  if (back) return at <= 0 ? count - 1 : null
  return at === count - 1 ? 0 : null
}

export interface DialogOptions {
  /** Called with the button's value, or DISMISSED, once the dialog has closed. */
  readonly onClose?: (value: string) => void
  /** Called once the dialog is in the top layer, where a toast has to follow it. */
  readonly onOpen?: () => void
  /** True adds the backdrop click that `closedby="any"` gives. Defaults to whether it is missing. */
  readonly lightDismiss?: boolean
}

export interface DialogHandle {
  readonly open: () => void
  readonly close: (value?: string) => void
  readonly dispose: () => void
}

export const lacksClosedBy = (): boolean => !('closedBy' in HTMLDialogElement.prototype)

const isOutside = (dialog: HTMLDialogElement, event: MouseEvent): boolean => {
  if (event.target !== dialog) return false
  const box = dialog.getBoundingClientRect()
  return (
    event.clientX < box.left ||
    event.clientX > box.right ||
    event.clientY < box.top ||
    event.clientY > box.bottom
  )
}

export function bindDialog(dialog: HTMLDialogElement, options: DialogOptions = {}): DialogHandle {
  const controller = new AbortController()
  const { signal } = controller
  const doc = dialog.ownerDocument

  dialog.addEventListener(
    'close',
    () => options.onClose?.(dialog.returnValue === '' ? DISMISSED : dialog.returnValue),
    { signal },
  )

  // The spec lets Tab leave a modal for the browser's own UI. APG keeps it inside.
  dialog.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
      const stops = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => !element.closest(UNREACHABLE),
      )
      const at = stops.findIndex((element) => element === doc.activeElement)
      const next = wrapTarget(stops.length, at, event.shiftKey)
      if (next === null) return
      event.preventDefault()
      stops[next]?.focus()
    },
    { signal },
  )

  if (options.lightDismiss ?? lacksClosedBy()) {
    // Both ends of the press must fall outside, as a drag from inside the box ends on the backdrop.
    let downOutside = false
    dialog.addEventListener(
      'pointerdown',
      (event) => {
        downOutside = isOutside(dialog, event)
      },
      { signal },
    )
    dialog.addEventListener(
      'click',
      (event) => {
        const dismiss = downOutside && isOutside(dialog, event)
        downOutside = false
        if (!dismiss || dialog.getAttribute('closedby') !== 'any') return
        if (Reflect.has(dialog, 'requestClose')) dialog.requestClose()
        else dialog.close()
      },
      { signal },
    )
  }

  return {
    open: () => {
      if (dialog.open) return
      dialog.returnValue = ''
      dialog.showModal()
      options.onOpen?.()
    },
    close: (value) => {
      if (dialog.open) dialog.close(value)
    },
    dispose: () => {
      controller.abort()
    },
  }
}
