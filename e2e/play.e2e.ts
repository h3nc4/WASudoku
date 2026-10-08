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

import { cell, cellFace, expect, expectAccessible, mistakes, savedGame, test } from './fixtures'

// R1C3 takes 1, 2 or 4 and its answer is 4. R1C4 takes 2 or 6.
const R1C3 = 2
const R1C4 = 3

test.beforeEach(async ({ open }) => {
  await open({ game: savedGame() })
})

test('pen digits erase, undo and redo', async ({ page }) => {
  const target = cell(page, R1C3)
  await target.click()
  await page.keyboard.press('4')
  await expect(target).toHaveValue('4')

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(target).toHaveValue('')
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(target).toHaveValue('4')

  await page.keyboard.press('ControlOrMeta+z')
  await expect(target).toHaveValue('')
  await page.keyboard.press('ControlOrMeta+y')
  await expect(target).toHaveValue('4')

  await page.getByRole('button', { name: 'Erase selected cell' }).click()
  await expect(target).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()
})

test('corner and center notes, a conflict and the mistakes counter', async ({ page }) => {
  await page.getByRole('radio', { name: 'Corner' }).click()
  await cell(page, R1C3).click()
  for (const key of ['1', '2', '4']) await page.keyboard.press(key)
  await expect(cellFace(page, R1C3)).toHaveText('124')
  // Row 1 already has a 5, and the note is refused.
  await page.keyboard.press('5')
  await expect(cellFace(page, R1C3)).toHaveText('124')

  await page.getByRole('radio', { name: 'Center' }).click()
  await cell(page, R1C4).click()
  for (const key of ['2', '6']) await page.keyboard.press(key)
  await expect(cellFace(page, R1C4)).toHaveText('26')
  await expectAccessible(page, 'board with notes')

  await page.getByRole('radio', { name: 'Pen' }).click()
  await cell(page, R1C3).click()
  await page.keyboard.press('5')
  await expect(cell(page, R1C3)).toHaveValue('5')
  await expect(cell(page, R1C3)).toHaveAttribute('aria-invalid', 'true')
  await expect(mistakes(page)).toHaveText('1/3')
  await expect(page.getByRole('button', { name: 'Solve' })).toBeDisabled()
  await expectAccessible(page, 'board with a conflict')

  await page.keyboard.press('Delete')
  await expect(cell(page, R1C3)).toHaveValue('')
  await expect(cell(page, R1C3)).toHaveAttribute('aria-invalid', 'false')
  await expect(mistakes(page)).toHaveText('1/3')

  await page.keyboard.press('4')
  await expect(cell(page, R1C3)).toHaveValue('4')
  await expect(mistakes(page)).toHaveText('1/3')
})
