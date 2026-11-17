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

import { afterEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { applyBuiltStyles, builtPage } from '../test/built-page'
import { bindThemeToggle, readTheme, THEME_KEY, THEME_SCRIPT } from './theme'

describe('the theme in a real engine', () => {
  afterEach(() => {
    sessionStorage.removeItem(THEME_KEY)
    document.documentElement.dataset['theme'] = 'dark'
    document.body.innerHTML = ''
  })

  it('ships the head script unchanged, ahead of the stylesheet', () => {
    const head = builtPage().head
    const scripts = [
      ...head.querySelectorAll('script:not([src]):not([type="application/ld+json"])'),
    ]
    expect(scripts.map((script) => script.textContent)).toEqual([THEME_SCRIPT])
    const order = [...head.children]
    expect(order.indexOf(scripts[0])).toBeLessThan(
      order.findIndex((child) => child.tagName === 'STYLE'),
    )
  })

  it('flips and stores the theme from the button, through a view transition where there is one', async () => {
    applyBuiltStyles()
    document.documentElement.dataset['theme'] = 'dark'
    document.body.innerHTML = '<button id="theme-button">Toggle theme</button>'
    const dispose = bindThemeToggle(document.getElementById('theme-button')!)
    await userEvent.click(document.getElementById('theme-button')!)
    await expect.poll(() => readTheme(document)).toBe('light')
    // The runner frames each test. The theme is stored in sessionStorage there.
    expect(sessionStorage.getItem(THEME_KEY)).toBe('light')
    expect(getComputedStyle(document.documentElement).colorScheme).toBe('light')
    dispose()
  })
})
