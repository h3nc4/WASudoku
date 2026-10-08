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

import { expect, expectAccessible, hideDocument, savedGame, test, timer } from './fixtures'

test('pause hides the board and stops the clock, and a hidden page pauses itself', async ({
  page,
  open,
}) => {
  await page.clock.install()
  await open({ game: savedGame(), metrics: { timer: 0, mistakes: 0 } })
  const grid = page.locator('[role="grid"]')
  await expect(grid).toBeVisible()
  await page.clock.runFor(3000)
  await expect(timer(page)).toHaveText('00:03')

  await page.getByRole('button', { name: 'Pause game' }).click()
  await expect(page.getByText('Paused', { exact: true })).toBeVisible()
  await expect(grid).toHaveAttribute('aria-hidden', 'true')
  await expect(grid).toBeHidden()
  await page.clock.runFor(5000)
  await expect(timer(page)).toHaveText('00:03')
  await expectAccessible(page, 'paused game')

  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(grid).toBeVisible()
  await expect(page.getByText('Paused', { exact: true })).toBeHidden()
  await page.clock.runFor(2000)
  await expect(timer(page)).toHaveText('00:05')

  await hideDocument(page)
  await expect(page.getByText('Paused', { exact: true })).toBeVisible()
  await expect(grid).toBeHidden()
  await expect(page.getByRole('button', { name: 'Resume game' })).toBeVisible()
})
