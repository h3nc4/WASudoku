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

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { TOAST_ACTIONS } from '../core/text/messages'
import { applyBuiltStyles } from '../test/built-page'
import { bindDialog } from './dialog'
import { createToaster, type Toaster } from './toast'

/** The bottom inset of `.toasts` on a phone, which the lift adds the panel's rise to. */
const TOAST_INSET_PX = 16
const LIFT_GAP_PX = 12
const FLOOR_RISE_PX = 300

function mount() {
  document.body.innerHTML = `
    <dialog id="d" class="dlg" aria-label="Clear board">
      <form method="dialog" class="contents"><button value="cancel">Cancel</button></form>
    </dialog>
    <div id="page" style="height:1200px"></div>
    <div data-toast-floor style="height:800px"></div>
    <ol id="toasts" class="toasts" popover="manual" aria-live="polite" aria-label="Notifications"></ol>`
  const host = document.getElementById('toasts')!
  const dialog = document.querySelector('dialog')!
  return { host, dialog }
}

const frame = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })

const settled = (element: Element) =>
  Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished))

const hitsCentre = (element: Element) => {
  const box = element.getBoundingClientRect()
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
  return element.contains(hit)
}

describe('toasts in a real engine', () => {
  let toaster: Toaster | undefined

  beforeAll(() => {
    applyBuiltStyles()
  })

  afterEach(() => {
    toaster?.dispose()
    window.scrollTo(0, 0)
    document.body.innerHTML = ''
  })

  it('shows in the top layer as a polite live list', async () => {
    const { host } = mount()
    toaster = createToaster(host)
    const item = toaster.show('Board cleared.')
    expect(host.matches(':popover-open')).toBe(true)
    await settled(item)
    expect(hitsCentre(item)).toBe(true)
  })

  it('keeps its buttons usable over an open modal, and goes back when it closes', async () => {
    const { host, dialog } = mount()
    toaster = createToaster(host)
    const handle = bindDialog(dialog, { onOpen: toaster.raise })
    handle.open()
    const undo = vi.fn()
    const item = toaster.show('Board cleared.', {
      duration: Infinity,
      action: { label: TOAST_ACTIONS.undo, run: undo },
    })
    expect(host.parentElement).toBe(dialog)
    await settled(item)
    const button = item.querySelector<HTMLButtonElement>('.toast-action')!
    expect(hitsCentre(button)).toBe(true)
    button.focus()
    expect(button).toHaveFocus()
    await userEvent.click(button)
    expect(undo).toHaveBeenCalledOnce()
    expect(dialog.open).toBe(true)
    const kept = toaster.show('Update available', { duration: Infinity })
    handle.close()
    await expect.poll(() => host.parentElement).toBe(document.body)
    expect(host.matches(':popover-open')).toBe(true)
    await settled(kept)
    expect(hitsCentre(kept)).toBe(true)
    handle.dispose()
  })

  it('follows a dialog opened after it, through the dialog toggle event', async () => {
    const { host, dialog } = mount()
    toaster = createToaster(host)
    const item = toaster.show('Puzzle link copied to clipboard.', { duration: Infinity })
    dialog.showModal()
    await expect.poll(() => host.parentElement).toBe(dialog)
    await settled(item)
    expect(hitsCentre(item.querySelector('.toast-close')!)).toBe(true)
    dialog.close()
  })

  it('rides above the steps panel as it scrolls in, or stays pinned without scroll timelines', async () => {
    const { host } = mount()
    toaster = createToaster(host)
    const item = toaster.show('Solver finished.', { duration: Infinity })
    await settled(item)
    const gap = () => innerHeight - host.getBoundingClientRect().bottom
    await frame()
    expect(Math.round(gap())).toBe(TOAST_INSET_PX)
    const floor = document.querySelector('[data-toast-floor]')!
    window.scrollTo(0, floor.getBoundingClientRect().top + scrollY - innerHeight + FLOOR_RISE_PX)
    await frame()
    const lifts = CSS.supports('animation-timeline: view()')
    const expected = lifts ? FLOOR_RISE_PX + LIFT_GAP_PX : TOAST_INSET_PX
    expect(Math.abs(gap() - expected)).toBeLessThanOrEqual(1)
  })
})
