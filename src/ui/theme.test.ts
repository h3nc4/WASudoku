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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { pageStorage } from '../runtime/storage'
import {
  applyTheme,
  bindThemeToggle,
  readTheme,
  THEME_KEY,
  THEME_SCRIPT,
  THEME_SCRIPT_HASH,
  toggleTheme,
} from './theme'

const root = document.documentElement
// The browser runner frames each test. The theme is stored in sessionStorage there.
const saved = pageStorage(globalThis)

/** Runs the head script in this realm, where vi.stubGlobal sets its matchMedia. */
function runHeadScript() {
  const evaluate = globalThis.eval
  evaluate(THEME_SCRIPT)
}

// A replaced `self` stops matching `top`, as in a frame, where the theme is stored in sessionStorage.
const frame = () => {
  vi.stubGlobal('self', {})
}

describe('the head script', () => {
  beforeEach(() => {
    delete root.dataset['theme']
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    delete root.dataset['theme']
  })

  it.each([
    ['light', false, 'light'],
    ['dark', false, 'dark'],
    ['system', true, 'dark'],
    ['system', false, 'light'],
    ['sepia', false, 'dark'],
  ])('reads a stored %s, the OS dark is %s, as %s', (stored, dark, theme) => {
    vi.stubGlobal('matchMedia', () => ({ matches: dark }))
    saved.setItem(THEME_KEY, stored)
    runHeadScript()
    expect(root.dataset['theme']).toBe(theme)
  })

  it('opens dark with nothing stored, or with storage refused', () => {
    runHeadScript()
    expect(root.dataset['theme']).toBe('dark')
    delete root.dataset['theme']
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    runHeadScript()
    expect(root.dataset['theme']).toBe('dark')
  })

  it('reads sessionStorage inside a frame', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    localStorage.setItem(THEME_KEY, 'dark')
    sessionStorage.setItem(THEME_KEY, 'light')
    frame()
    runHeadScript()
    expect(root.dataset['theme']).toBe('light')
  })

  it('keeps a theme the page already names', () => {
    saved.setItem(THEME_KEY, 'dark')
    root.dataset['theme'] = 'light'
    runHeadScript()
    expect(root.dataset['theme']).toBe('light')
  })

  it('carries the hash a CSP needs to allow it', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(THEME_SCRIPT))
    const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
    expect(THEME_SCRIPT_HASH).toBe(`'sha256-${base64}'`)
  })
})

describe('the toggle', () => {
  beforeEach(() => {
    root.dataset['theme'] = 'dark'
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document, 'startViewTransition')
  })

  it('reads anything but light as dark', () => {
    expect(readTheme(document)).toBe('dark')
    root.dataset['theme'] = 'light'
    expect(readTheme(document)).toBe('light')
    root.dataset['theme'] = 'sepia'
    expect(readTheme(document)).toBe('dark')
  })

  it('applies a theme with transitions held off for one layout', () => {
    const seen: boolean[] = []
    vi.spyOn(root, 'getBoundingClientRect').mockImplementation(() => {
      seen.push(root.classList.contains('theme-switching'))
      return new DOMRect()
    })
    applyTheme(document, 'light')
    expect(seen).toEqual([true])
    expect(root.dataset['theme']).toBe('light')
    expect(root).not.toHaveClass('theme-switching')
  })

  it('flips and stores the theme, inside a view transition when motion is allowed', () => {
    const transition = vi.fn((update: () => void) => {
      update()
    })
    Object.defineProperty(document, 'startViewTransition', {
      value: transition,
      configurable: true,
    })
    expect(toggleTheme(document, { reducedMotion: () => false })).toBe('light')
    expect(transition).toHaveBeenCalledOnce()
    expect(saved.getItem(THEME_KEY)).toBe('light')
    expect(toggleTheme(document, { reducedMotion: () => true })).toBe('dark')
    expect(transition).toHaveBeenCalledOnce()
    expect(root.dataset['theme']).toBe('dark')
  })

  it('stores the choice in sessionStorage inside a frame, leaving the saved theme alone', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    frame()
    expect(toggleTheme(document, { reducedMotion: () => true })).toBe('light')
    expect(sessionStorage.getItem(THEME_KEY)).toBe('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
  })

  it('flips at once under reduced motion, read from the media query by default', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(toggleTheme(document)).toBe('light')
    expect(root.dataset['theme']).toBe('light')
  })

  it('still flips when storage refuses the write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(toggleTheme(document, { reducedMotion: () => true })).toBe('light')
    expect(root.dataset['theme']).toBe('light')
  })

  it('works in a document without a window, which has no storage or media', () => {
    const detached = document.implementation.createHTMLDocument()
    expect(toggleTheme(detached)).toBe('light')
    const button = detached.createElement('button')
    detached.body.append(button)
    bindThemeToggle(button)
    button.click()
    expect(readTheme(detached)).toBe('dark')
  })

  it('binds the button and follows another tab', () => {
    document.body.innerHTML = '<button id="theme-button">Toggle theme</button>'
    const button = document.getElementById('theme-button')!
    const dispose = bindThemeToggle(button, { reducedMotion: () => true })
    button.click()
    expect(readTheme(document)).toBe('light')
    const storage = (key: string, newValue: string | null) => {
      window.dispatchEvent(new StorageEvent('storage', { key, newValue }))
    }
    storage(THEME_KEY, 'dark')
    expect(readTheme(document)).toBe('dark')
    storage(THEME_KEY, 'light')
    expect(readTheme(document)).toBe('light')
    storage('other', 'dark')
    storage(THEME_KEY, 'sepia')
    storage(THEME_KEY, null)
    expect(readTheme(document)).toBe('light')
    dispose()
    button.click()
    storage(THEME_KEY, 'dark')
    expect(readTheme(document)).toBe('light')
    document.body.innerHTML = ''
  })
})
