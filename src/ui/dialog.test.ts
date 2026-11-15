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

import { afterEach, describe, expect, it, vi } from 'vitest'

import { bindDialog, DISMISSED, lacksClosedBy, wrapTarget } from './dialog'

describe('wrapTarget', () => {
  it('wraps at either end and leaves the middle to the browser', () => {
    expect(wrapTarget(3, 2, false)).toBe(0)
    expect(wrapTarget(3, 0, true)).toBe(2)
    expect(wrapTarget(3, -1, true)).toBe(2)
    expect(wrapTarget(3, 1, false)).toBeNull()
    expect(wrapTarget(3, 1, true)).toBeNull()
    expect(wrapTarget(3, -1, false)).toBeNull()
    expect(wrapTarget(0, -1, false)).toBeNull()
  })
})

/** A dialog whose modal methods are stubs, the same in jsdom and in an engine. */
function mount(inner = '') {
  document.body.innerHTML = `
    <button id="opener">open</button>
    <dialog id="d" closedby="any">
      <form method="dialog">
        <button id="cancel" value="cancel">Cancel</button>
        <button id="hidden" hidden>Hidden</button>
        <div inert><button>Inert</button></div>
        <button id="confirm" value="confirm">Confirm</button>
      </form>
      ${inner}
    </dialog>`
  const dialog = document.querySelector('dialog')!
  const showModal = vi.fn(() => {
    dialog.setAttribute('open', '')
  })
  const close = vi.fn((value?: string) => {
    if (value !== undefined) dialog.returnValue = value
    dialog.removeAttribute('open')
    dialog.dispatchEvent(new Event('close'))
  })
  dialog.showModal = showModal
  dialog.close = close
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 200, 100))
  return { dialog, showModal, close }
}

const tab = (target: Element, shiftKey = false, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

const pointer = (
  dialog: HTMLDialogElement,
  type: string,
  x: number,
  y: number,
  target: HTMLElement = dialog,
) => target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }))

describe('bindDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('opens modal with a fresh return value, once', () => {
    const { dialog, showModal } = mount()
    const onOpen = vi.fn()
    const handle = bindDialog(dialog, { onOpen })
    dialog.returnValue = 'confirm'
    handle.open()
    expect(dialog.returnValue).toBe('')
    expect(onOpen).toHaveBeenCalledOnce()
    handle.open()
    expect(showModal).toHaveBeenCalledOnce()
  })

  it('reports the button value, or a dismissal for an empty one', () => {
    const { dialog, close } = mount()
    const onClose = vi.fn()
    const handle = bindDialog(dialog, { onClose })
    handle.close()
    expect(close).not.toHaveBeenCalled()
    handle.open()
    handle.close('expert')
    expect(onClose).toHaveBeenLastCalledWith('expert')
    handle.open()
    handle.close()
    expect(onClose).toHaveBeenLastCalledWith(DISMISSED)
  })

  it('closes without a listener', () => {
    const { dialog } = mount()
    const handle = bindDialog(dialog)
    handle.open()
    expect(() => {
      handle.close('confirm')
    }).not.toThrow()
  })

  it('wraps Tab over the reachable buttons only', () => {
    const { dialog } = mount('<ol><li data-leaving><button>Undo</button></li></ol>')
    bindDialog(dialog).open()
    const cancel = document.getElementById('cancel')!
    const confirm = document.getElementById('confirm')!
    confirm.focus()
    expect(tab(confirm).defaultPrevented).toBe(true)
    expect(cancel).toHaveFocus()
    expect(tab(cancel, true).defaultPrevented).toBe(true)
    expect(confirm).toHaveFocus()
    expect(tab(confirm, true).defaultPrevented).toBe(false)
  })

  it('leaves Tab with a modifier, other keys and an empty dialog alone', () => {
    const { dialog } = mount()
    bindDialog(dialog).open()
    const confirm = document.getElementById('confirm')!
    confirm.focus()
    expect(tab(confirm, false, { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(tab(confirm, false, { altKey: true }).defaultPrevented).toBe(false)
    expect(tab(confirm, false, { metaKey: true }).defaultPrevented).toBe(false)
    expect(tab(confirm, false, { key: 'Enter' }).defaultPrevented).toBe(false)
    dialog.replaceChildren()
    expect(tab(dialog).defaultPrevented).toBe(false)
  })

  it('reads closedby support off the dialog prototype', () => {
    expect(lacksClosedBy()).toBe(!('closedBy' in HTMLDialogElement.prototype))
  })

  // An engine with requestClose closes through it, so this reads the outcome and not the stub.
  it('closes on a press outside its box where closedby is missing', () => {
    const { dialog } = mount()
    bindDialog(dialog, { lightDismiss: true }).open()
    pointer(dialog, 'pointerdown', 150, 150)
    pointer(dialog, 'click', 50, 50)
    pointer(dialog, 'pointerdown', 50, 50)
    pointer(dialog, 'click', 150, 150)
    for (const [x, y] of [
      [350, 150],
      [150, 50],
      [150, 250],
    ] as const) {
      pointer(dialog, 'pointerdown', x, y)
      pointer(dialog, 'click', 150, 150)
    }
    const inner = document.getElementById('cancel')!
    pointer(dialog, 'pointerdown', 50, 50, inner)
    pointer(dialog, 'click', 50, 50)
    expect(dialog.open).toBe(true)
    pointer(dialog, 'pointerdown', 50, 50)
    pointer(dialog, 'click', 50, 50)
    expect(dialog.open).toBe(false)
  })

  it('asks to close through requestClose where the engine has it, and else closes', () => {
    const { dialog, close } = mount()
    const requestClose = vi.fn()
    Object.defineProperty(dialog, 'requestClose', { value: requestClose, configurable: true })
    bindDialog(dialog, { lightDismiss: true })
    pointer(dialog, 'pointerdown', 350, 150)
    pointer(dialog, 'click', 350, 150)
    expect(requestClose).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
  })

  it('keeps a dialog open on an outside press unless closedby is any', () => {
    const { dialog, close } = mount()
    dialog.setAttribute('closedby', 'closerequest')
    bindDialog(dialog, { lightDismiss: true })
    pointer(dialog, 'pointerdown', 50, 50)
    pointer(dialog, 'click', 50, 50)
    expect(close).not.toHaveBeenCalled()
  })

  it('adds no backdrop click where the engine already has closedby', () => {
    const { dialog, close } = mount()
    bindDialog(dialog, { lightDismiss: false })
    pointer(dialog, 'pointerdown', 50, 50)
    pointer(dialog, 'click', 50, 50)
    expect(close).not.toHaveBeenCalled()
  })

  it('stops listening once disposed', () => {
    const { dialog } = mount()
    const onClose = vi.fn()
    bindDialog(dialog, { onClose }).dispose()
    dialog.dispatchEvent(new Event('close'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
