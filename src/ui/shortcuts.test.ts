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
import { bindShortcuts, isApple, SHORTCUTS_BUTTON, SHORTCUTS_DIALOG } from './shortcuts'

const dialog = () => document.querySelector<HTMLDialogElement>(SHORTCUTS_DIALOG)!
const button = () => document.querySelector<HTMLElement>(SHORTCUTS_BUTTON)!
const caps = () => [...dialog().querySelectorAll('[data-modifier]')].map((cap) => cap.textContent)

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
    dispose = bindShortcuts(document, onOpen, false)
  })

  afterEach(() => {
    dispose()
    vi.unstubAllGlobals()
  })

  it('opens from the header button, raising the toasts over it', () => {
    button().click()
    expect(dialog().open).toBe(true)
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('reads the keyboard off the user agent by default', () => {
    dispose()
    dispose = bindShortcuts(document, onOpen)
    expect(new Set(caps())).toEqual(new Set([isApple(navigator.userAgent) ? 'Cmd' : 'Ctrl']))
  })

  it('prints Ctrl off an Apple keyboard', () => {
    expect(caps().length).toBeGreaterThan(0)
    expect(new Set(caps())).toEqual(new Set(['Ctrl']))
  })

  it('prints Cmd in place of Ctrl on an Apple keyboard', () => {
    dispose()
    dispose = bindShortcuts(document, onOpen, true)
    expect(new Set(caps())).toEqual(new Set(['Cmd']))
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
    button().click()
    expect(dialog().open).toBe(false)
  })
})

describe('isApple', () => {
  it('reads a Mac, an iPhone and an iPad off the user agent', () => {
    for (const agent of [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    ]) {
      expect(isApple(agent)).toBe(true)
    }
  })

  it('leaves Linux, Windows and Android on Ctrl', () => {
    for (const agent of [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/140.0 Mobile',
    ]) {
      expect(isApple(agent)).toBe(false)
    }
  })
})
