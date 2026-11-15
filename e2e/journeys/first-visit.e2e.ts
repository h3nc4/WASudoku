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
  board,
  cell,
  difficulty,
  digitOf,
  expect,
  expectAccessible,
  mistakes,
  readBoard,
  test,
  timer,
} from '../fixtures'

test('first visit generates a puzzle in the worker for the chosen difficulty', async ({
  page,
  open,
}) => {
  await open({ pool: false })
  await expect(page.getByRole('heading', { name: 'Welcome to WASudoku' })).toBeVisible()
  await expectAccessible(page, 'selection screen')

  await page.getByRole('button', { name: 'Easy', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Welcome to WASudoku' })).toBeHidden()
  await expect(difficulty(page)).toHaveText('Easy')
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
  await expect(digitOf(page, given)).toHaveText(digits[given] ?? '')
  await expectAccessible(page, 'generated puzzle')
})

// Room for one generate per difficulty, expert included, on a slow CI runner.
const REFILL_TIMEOUT_MS = 20_000

test('first visit generates in the foreground while the pool fills one puzzle per difficulty', async ({
  page,
  open,
}) => {
  await open({ pool: false })
  await page.getByRole('button', { name: 'Medium', exact: true }).click()

  await expect(difficulty(page)).toHaveText('Medium')
  await expect(board(page)).toBeVisible()
  expect([...(await readBoard(page))].some((d) => d !== '.')).toBe(true)

  const stored = () =>
    page.evaluate(() => {
      const raw = localStorage.getItem('wasudoku.state.pool')
      const pool = (raw ? JSON.parse(raw).puzzlePool : {}) as Record<string, unknown[]>
      return ['easy', 'medium', 'hard', 'expert', 'extreme'].map((d) => pool[d]?.length ?? 0)
    })
  await expect
    .poll(async () => Math.min(...(await stored())), { timeout: REFILL_TIMEOUT_MS })
    .toBeGreaterThan(0)
})
