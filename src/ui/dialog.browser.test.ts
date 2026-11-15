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

import { applyBuiltStyles } from '../test/built-page'
import { bindDialog, type DialogHandle, DISMISSED } from './dialog'

function mount() {
  document.body.innerHTML = `
    <button id="opener">New puzzle</button>
    <button id="outside">outside</button>
    <dialog id="abandon-dialog" role="alertdialog" class="dlg" closedby="any"
      aria-labelledby="abandon-title" aria-describedby="abandon-description">
      <form method="dialog" class="contents">
        <h2 id="abandon-title">Abandon current game?</h2>
        <p id="abandon-description">The board in progress is replaced.</p>
        <button id="cancel" type="submit" value="cancel">Cancel</button>
        <button id="confirm" type="submit" value="confirm">Start new puzzle</button>
        <button id="close" type="submit" value="close" aria-label="Close">x</button>
      </form>
    </dialog>`
  const byId = (id: string) => document.getElementById(id)!
  const dialog = document.querySelector('dialog')!
  return { byId, dialog }
}

const focused = () => document.activeElement

describe('the modal dialog in a real engine', () => {
  let handle: DialogHandle | undefined

  beforeAll(() => {
    applyBuiltStyles()
  })

  afterEach(() => {
    handle?.close()
    handle?.dispose()
    document.body.innerHTML = ''
  })

  it('opens modal over an inert page, focuses Cancel and locks the scroll', () => {
    const { byId, dialog } = mount()
    handle = bindDialog(dialog)
    byId('opener').focus()
    handle.open()
    expect(dialog.matches(':modal')).toBe(true)
    expect(focused()).toBe(byId('cancel'))
    byId('outside').focus()
    expect(focused()).not.toBe(byId('outside'))
    expect(getComputedStyle(document.documentElement).overflow).toBe('hidden')
    handle.close()
    expect(getComputedStyle(document.documentElement).overflow).not.toBe('hidden')
  })

  it('wraps Tab and Shift+Tab inside the dialog', async () => {
    const { byId, dialog } = mount()
    handle = bindDialog(dialog)
    handle.open()
    await userEvent.tab()
    expect(focused()).toBe(byId('confirm'))
    await userEvent.tab()
    expect(focused()).toBe(byId('close'))
    await userEvent.tab()
    expect(focused()).toBe(byId('cancel'))
    await userEvent.tab({ shift: true })
    expect(focused()).toBe(byId('close'))
  })

  it('reports Esc as a dismissal and returns focus to the opener', async () => {
    const { byId, dialog } = mount()
    const onClose = vi.fn()
    handle = bindDialog(dialog, { onClose })
    byId('opener').focus()
    handle.open()
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => onClose.mock.calls).toEqual([[DISMISSED]])
    expect(dialog.open).toBe(false)
    expect(focused()).toBe(byId('opener'))
  })

  it('reports the pressed button, and no stale value on the next dismissal', async () => {
    const { byId, dialog } = mount()
    const onClose = vi.fn()
    handle = bindDialog(dialog, { onClose })
    handle.open()
    await userEvent.click(byId('confirm'))
    await expect.poll(() => onClose.mock.calls).toEqual([['confirm']])
    handle.open()
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => onClose.mock.calls.at(-1)).toEqual([DISMISSED])
  })

  it('closes on a backdrop click through the native closedby', async () => {
    const { dialog } = mount()
    const onClose = vi.fn()
    handle = bindDialog(dialog, { onClose, lightDismiss: false })
    handle.open()
    await userEvent.click(document.documentElement, { position: { x: 4, y: 4 } })
    await expect.poll(() => onClose.mock.calls).toEqual([[DISMISSED]])
  })

  it('closes on an outside press through the fallback, and not on a drag out', async () => {
    const { byId, dialog } = mount()
    const onClose = vi.fn()
    handle = bindDialog(dialog, { onClose, lightDismiss: true })
    handle.open()
    const box = dialog.getBoundingClientRect()
    const at = (x: number, y: number) => ({ clientX: x, clientY: y, bubbles: true })
    const inside = at(box.left + 10, box.top + 10)
    const outside = at(box.left - 10, box.top - 10)
    byId('cancel').dispatchEvent(new PointerEvent('pointerdown', inside))
    dialog.dispatchEvent(new MouseEvent('click', outside))
    expect(dialog.open).toBe(true)
    dialog.dispatchEvent(new PointerEvent('pointerdown', outside))
    dialog.dispatchEvent(new MouseEvent('click', outside))
    await expect.poll(() => onClose.mock.calls).toEqual([[DISMISSED]])
  })
})
