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

import {
  cell,
  expect,
  expectAccessible,
  mistakes,
  PUZZLE,
  readBoard,
  savedGame,
  solvedExcept,
  test,
  timer,
} from './fixtures'

// R9C7 is the last cell left, and its answer is 1.
const LAST = 78

test('last digit opens the win dialog, which starts another puzzle', async ({ page, open }) => {
  await open({
    game: savedGame({ board: solvedExcept(LAST) }),
    metrics: { timer: 75, mistakes: 1 },
  })
  await cell(page, LAST).click()
  await page.keyboard.press('1')

  const dialog = page.getByRole('dialog', { name: 'Puzzle solved' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(/Easy puzzle finished in 01:\d{2} with 1 mistake\./)
  await expect(page.getByText('Solved', { exact: true })).toBeVisible()
  await expectAccessible(page, 'win dialog')

  await dialog.getByRole('button', { name: 'Easy', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(mistakes(page)).toHaveText('0/3')
  await expect(timer(page)).toHaveText(/^00:0\d$/)
  await expect.poll(() => readBoard(page)).toBe(PUZZLE.replaceAll('0', '.'))
})
