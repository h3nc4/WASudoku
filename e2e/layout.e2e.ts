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

import { board, expect, savedGame, test } from './fixtures'

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 900 }

/** The board's top edge in page coordinates. Scrolling to a button then leaves it unchanged. */
const boardTop = (page: Page) =>
  board(page).evaluate((grid) => grid.getBoundingClientRect().top + globalThis.scrollY)

test('play screen fits a 390x844 phone without vertical scroll', async ({ page, open }) => {
  await page.setViewportSize(PHONE)
  await open({ game: savedGame() })
  await expect(board(page)).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

for (const size of [PHONE, DESKTOP]) {
  test(`board stays in place when the hint strip opens at ${size.width}x${size.height}`, async ({
    page,
    open,
  }) => {
    await page.setViewportSize(size)
    await open({ game: savedGame() })
    await expect(page.getByRole('button', { name: 'Hint' })).toBeEnabled()
    // A late webfont would move the header, and with it the board.
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    const before = await boardTop(page)
    await page.getByRole('button', { name: 'Hint' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Hint' })).toBeVisible()
    expect(await boardTop(page)).toBeCloseTo(before, 1)
  })
}
