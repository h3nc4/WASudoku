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
  AMBIGUOUS,
  cell,
  expect,
  expectAccessible,
  mistakes,
  paste,
  PUZZLE,
  readBoard,
  test,
} from './fixtures'

const R1C3 = 2
const PUZZLE_DIGITS = PUZZLE.replaceAll('0', '.')
const toast = (page: Page, text: string) => page.getByText(text, { exact: true })

test('shared link offers its puzzle, validates it and starts play', async ({ page, open }) => {
  await open({ path: `/?p=${PUZZLE}` })
  const offer = page.getByRole('dialog', { name: 'Start this puzzle?' })
  await expect(offer).toBeVisible()
  await expect(page).not.toHaveURL(/[?&]p=/)
  await expectAccessible(page, 'shared puzzle offer')

  await offer.getByRole('button', { name: 'Start puzzle' }).click()
  await expect(toast(page, 'Puzzle is valid and has a unique solution.')).toBeVisible()
  await expect(page.getByText('Custom', { exact: true })).toBeVisible()
  await expect.poll(() => readBoard(page)).toBe(PUZZLE_DIGITS)

  // Validation found the solution. A wrong digit then counts as a mistake.
  await cell(page, R1C3).click()
  await page.keyboard.press('1')
  await expect(mistakes(page)).toHaveText('1/3')
})

test('Create Your Own takes a pasted puzzle and refuses bad ones', async ({ page, open }) => {
  await open()
  await page.getByRole('button', { name: 'Create Your Own' }).click()
  await expect(page.getByRole('button', { name: 'Start Puzzle' })).toBeDisabled()
  await expectAccessible(page, 'custom puzzle entry')

  await cell(page, 0).click()
  await paste(cell(page, 0), 'not a sudoku')
  await expect(toast(page, 'Invalid board format in clipboard.')).toBeVisible()
  await expect.poll(() => readBoard(page)).toBe('.'.repeat(81))

  await paste(cell(page, 0), AMBIGUOUS)
  await expect(toast(page, 'Board imported from clipboard.')).toBeVisible()
  await page.getByRole('button', { name: 'Start Puzzle' }).click()
  await expect(toast(page, 'Puzzle is invalid or does not have a unique solution.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Puzzle' })).toBeEnabled()

  await cell(page, 0).click()
  await paste(cell(page, 0), PUZZLE)
  await expect.poll(() => readBoard(page)).toBe(PUZZLE_DIGITS)
  await page.getByRole('button', { name: 'Start Puzzle' }).click()
  await expect(toast(page, 'Puzzle is valid and has a unique solution.')).toBeVisible()
  await expect(page.getByText('Custom', { exact: true })).toBeVisible()
  await expect(mistakes(page)).toHaveText('0/3')
})
