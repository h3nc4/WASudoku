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

import { cell, expect, expectAccessible, padKey, savedGame, solvedExcept, test } from './fixtures'

const stickyToggle = (page: Page) => page.getByRole('button', { name: 'Sticky numbers' })

// R1C3 is 4, R1C4 is 6 and R1C8 is the last 1 missing from the near-complete board.
const R1C3 = 2
const R1C4 = 3
const R1C8 = 7

test('sticky numbers place the locked digit on each tap and never on arrow keys', async ({
  page,
  open,
}) => {
  await open({ game: savedGame() })
  await expect(stickyToggle(page)).toHaveAttribute('aria-pressed', 'false')
  await stickyToggle(page).click()
  await expect(stickyToggle(page)).toHaveAttribute('aria-pressed', 'true')

  await padKey(page, 4).click()
  await expect(padKey(page, 4)).toHaveAttribute('aria-pressed', 'true')
  await expectAccessible(page, 'sticky lock')

  await cell(page, R1C3).click()
  await expect(cell(page, R1C3)).toHaveValue('4')
  // A second tap with the same digit takes it back.
  await cell(page, R1C3).click()
  await expect(cell(page, R1C3)).toHaveValue('')
  await cell(page, R1C3).click()
  await expect(cell(page, R1C3)).toHaveValue('4')

  await page.keyboard.press('ArrowRight')
  await expect(cell(page, R1C4)).toBeFocused()
  await expect(cell(page, R1C4)).toHaveValue('')

  await page.keyboard.press('Escape')
  await expect(padKey(page, 4)).toHaveAttribute('aria-pressed', 'false')
  await cell(page, R1C4).click()
  await expect(cell(page, R1C4)).toHaveValue('')

  await page.keyboard.press('s')
  await expect(stickyToggle(page)).toHaveAttribute('aria-pressed', 'false')
  await expect(padKey(page, 4)).not.toHaveAttribute('aria-pressed')
  await page.keyboard.press('S')
  await expect(stickyToggle(page)).toHaveAttribute('aria-pressed', 'true')
})

test('sticky lock releases once its digit is complete', async ({ page, open }) => {
  await open({ game: savedGame({ board: solvedExcept(R1C3, R1C4, R1C8) }) })
  await stickyToggle(page).click()
  await padKey(page, 1).click()
  await expect(padKey(page, 1)).toHaveAttribute('aria-pressed', 'true')

  await cell(page, R1C8).click()
  await expect(cell(page, R1C8)).toHaveValue('1')
  await expect(padKey(page, 1)).toBeDisabled()
  await expect(padKey(page, 1)).toHaveAttribute('aria-pressed', 'false')
  await expect(stickyToggle(page)).toHaveAttribute('aria-pressed', 'true')

  // With nothing locked, a tap only selects.
  await cell(page, R1C3).click()
  await expect(cell(page, R1C3)).toHaveValue('')
  await expect(cell(page, R1C3)).toBeFocused()
})
