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

import { board, cell, expect, expectAccessible, mistakes, readBoard, test, timer } from './fixtures'

test('first visit generates a puzzle in the worker for the chosen difficulty', async ({
  page,
  open,
}) => {
  await open({ pool: false })
  await expect(page.getByRole('heading', { name: 'Welcome to WASudoku' })).toBeVisible()
  await expectAccessible(page, 'selection screen')

  await page.getByRole('button', { name: 'Easy', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Welcome to WASudoku' })).toBeHidden()
  await expect(page.getByText('Easy', { exact: true })).toBeVisible()
  await expect(mistakes(page)).toHaveText('0/3')
  await expect(timer(page)).toBeVisible()
  await expect(board(page)).toBeVisible()

  const digits = await readBoard(page)
  const givens = [...digits].filter((d) => d !== '.').length
  expect(givens).toBeGreaterThanOrEqual(17)
  expect(givens).toBeLessThan(81)

  // A clue refuses a new digit.
  const given = [...digits].findIndex((d) => d !== '.')
  const other = digits[given] === '9' ? '1' : '9'
  await cell(page, given).click()
  await page.keyboard.press(other)
  await expect(cell(page, given)).toHaveValue(digits[given])
  await expectAccessible(page, 'generated puzzle')
})
