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

import type { Page } from '@playwright/test'

import { expect, expectAccessible, savedGame, test } from './fixtures'

// The page background each theme sets in index.css.
const LIGHT_BACKGROUND = 'rgb(238, 240, 238)'
const DARK_BACKGROUND = 'rgb(18, 20, 24)'

const html = (page: Page) => page.locator('html')
const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor)

test('theme choice renders its colours and survives a reload', async ({ page, open }) => {
  await open({ game: savedGame() })
  const toggle = page.getByRole('button', { name: 'Toggle theme' })

  // The app starts dark whatever the system says, so light comes first.
  await expect(html(page)).toHaveClass(/\bdark\b/)
  await toggle.click()
  await expect(html(page)).toHaveClass(/\blight\b/)
  await expect(html(page)).not.toHaveClass(/\bdark\b/)
  await expect.poll(() => background(page)).toBe(LIGHT_BACKGROUND)
  await expectAccessible(page, 'light theme')

  await toggle.click()
  await expect(html(page)).toHaveClass(/\bdark\b/)
  await expect.poll(() => background(page)).toBe(DARK_BACKGROUND)
  await expectAccessible(page, 'dark theme')

  await page.reload()
  await expect(html(page)).toHaveClass(/\bdark\b/)
  await expect.poll(() => background(page)).toBe(DARK_BACKGROUND)

  await toggle.click()
  await page.reload()
  await expect(html(page)).toHaveClass(/\blight\b/)
  await expect.poll(() => background(page)).toBe(LIGHT_BACKGROUND)
})
