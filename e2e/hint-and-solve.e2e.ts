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

import {
  cell,
  expect,
  expectAccessible,
  mistakes,
  PUZZLE,
  readBoard,
  savedGame,
  SOLUTION,
  test,
} from './fixtures'

const R1C3 = 2
const hintStrip = (page: Page) => page.getByRole('status').filter({ hasText: 'Hint' })
const stepCounter = (page: Page) =>
  page
    .getByRole('heading', { name: 'Solving Steps' })
    .locator('xpath=..')
    .getByText(/^\d+\/\d+$/)

/** The counter reads as position over step count, such as 07/51. */
async function readCounter(page: Page): Promise<[number, number]> {
  const [position, total] = (await stepCounter(page).innerText()).split('/').map(Number)
  return [position, total]
}

const asDigits = (s: string) => s.replaceAll('0', '.')

test.beforeEach(async ({ open }) => {
  await open({ game: savedGame() })
})

test('hint points at a wrong digit first, then gives a logical step', async ({ page }) => {
  await cell(page, R1C3).click()
  await page.keyboard.press('1')
  await expect(mistakes(page)).toHaveText('1/3')

  await page.getByRole('button', { name: 'Hint' }).click()
  await expect(hintStrip(page)).toContainText('Check this cell')
  await expect(hintStrip(page)).toContainText('R1C3 does not match the solution')
  await expectAccessible(page, 'mistake hint')

  // Editing the board dismisses the hint.
  await page.getByRole('button', { name: 'Erase selected cell' }).click()
  await expect(hintStrip(page)).toBeHidden()

  await page.getByRole('button', { name: 'Hint' }).click()
  await expect(hintStrip(page)).toBeVisible()
  await expect(hintStrip(page)).not.toContainText('Check this cell')
  await expect(hintStrip(page)).not.toContainText('No logical technique applies')
  await expectAccessible(page, 'step hint')

  await page.getByRole('button', { name: 'Dismiss hint' }).click()
  await expect(hintStrip(page)).toBeHidden()
})

test('solve asks first, then walks through every step', async ({ page }) => {
  await page.getByRole('button', { name: 'Solve' }).click()
  const confirm = page.getByRole('dialog', { name: 'Reveal the solution?' })
  await expect(confirm).toBeVisible()
  await expectAccessible(page, 'solve confirmation')
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Solving Steps' })).toBeHidden()

  await page.getByRole('button', { name: 'Solve' }).click()
  await confirm.getByRole('button', { name: 'Reveal solution' }).click()
  await expect(page.getByRole('heading', { name: 'Solving Steps' })).toBeVisible()
  await expect(page.getByText(/^Solved in \d+ steps?$/)).toBeVisible()
  await expect.poll(() => readBoard(page)).toBe(SOLUTION)
  const [end, total] = await readCounter(page)
  expect(end).toBe(total)
  expect(total).toBeGreaterThan(1)
  await expectAccessible(page, 'walkthrough')

  await page.getByRole('button', { name: 'Previous step' }).click()
  await expect(stepCounter(page)).toHaveText(new RegExp(`^0*${total - 1}/${total}$`))
  await page.keyboard.press('ArrowLeft')
  await expect(stepCounter(page)).toHaveText(new RegExp(`^0*${total - 2}/${total}$`))
  await page.keyboard.press('ArrowRight')
  await expect(stepCounter(page)).toHaveText(new RegExp(`^0*${total - 1}/${total}$`))
  await page.getByRole('button', { name: 'Next step' }).click()
  await expect(stepCounter(page)).toHaveText(new RegExp(`^0*${total}/${total}$`))
  await expect(page.getByRole('button', { name: 'Next step' })).toBeDisabled()

  await page.getByRole('button', { name: 'Initial Board State' }).click()
  await expect(stepCounter(page)).toHaveText(new RegExp(`^0+/${total}$`))
  await expect.poll(() => readBoard(page)).toBe(asDigits(PUZZLE))
  await expect(page.getByRole('button', { name: 'Previous step' })).toBeDisabled()

  await page.getByRole('button', { name: 'Exit Visualization' }).click()
  await expect(page.getByRole('heading', { name: 'Solving Steps' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Hint' })).toBeEnabled()
  await expect.poll(() => readBoard(page)).toBe(asDigits(PUZZLE))
})
