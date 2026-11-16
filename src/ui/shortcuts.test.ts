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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mountPage } from '../test/app-page'
import { bindShortcuts, SHORTCUTS_BUTTON, SHORTCUTS_DIALOG } from './shortcuts'

const dialog = () => document.querySelector<HTMLDialogElement>(SHORTCUTS_DIALOG)!

/** Presses ? on `target`, returning whether the browser's own handling was stopped. */
function pressHelp(target: Element): boolean {
  const event = new KeyboardEvent('keydown', {
    key: '?',
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

describe('bindShortcuts', () => {
  let dispose: () => void = () => undefined
  const onOpen = vi.fn()

  beforeEach(() => {
    mountPage()
    onOpen.mockClear()
    dispose = bindShortcuts(document, onOpen)
  })

  afterEach(() => {
    dispose()
    vi.unstubAllGlobals()
  })

  it('opens from the header button, raising the toasts over it', () => {
    document.querySelector<HTMLElement>(SHORTCUTS_BUTTON)!.click()
    expect(dialog().open).toBe(true)
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('opens on ? from a cell and keeps the key from the browser', () => {
    expect(pressHelp(document.querySelector('#cell-0')!)).toBe(true)
    expect(dialog().open).toBe(true)
  })

  it('leaves ? to a text field', () => {
    const field = document.createElement('input')
    document.body.append(field)
    expect(pressHelp(field)).toBe(false)
    expect(dialog().open).toBe(false)
  })

  it('stops listening once disposed', () => {
    dispose()
    pressHelp(document.body)
    document.querySelector<HTMLElement>(SHORTCUTS_BUTTON)!.click()
    expect(dialog().open).toBe(false)
  })
})
