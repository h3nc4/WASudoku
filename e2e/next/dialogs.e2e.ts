/*
 * Copyright (C) 2026  Henrique Almeida
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

import { cell, expect, PUZZLE, savedGame, test } from './fixtures'

// Where dist-next once parted from today's app around its dialogs, menus and toasts.

const R1C3 = 2
const SHORT = { width: 360, height: 780 }
const TALL = { width: 1920, height: 1080 }
const COPIED = /Board exported to clipboard\.|Failed to copy to clipboard\./
const newPuzzle = (page: Page) => page.getByRole('button', { name: 'New Puzzle' })

/** Puts a digit on the board, which makes a new puzzle ask before it abandons the game. */
async function makeProgress(page: Page) {
  await cell(page, R1C3).click()
  await page.keyboard.press('4')
}

test('choosing from a menu hands focus back to its button', async ({ page, open }) => {
  await open({ game: savedGame() })
  await newPuzzle(page).click()
  await page.getByRole('menuitem', { name: 'Hard' }).click()
  await expect(page.locator('[data-status="difficulty"]')).toHaveText('Hard')
  await expect(newPuzzle(page)).toBeFocused()
  await page.locator('#share-button').click()
  await page.getByRole('menuitem', { name: 'Copy board as text' }).click()
  await expect(page.locator('#share-button')).toBeFocused()
})

test('a shared link over a game warns of the replaced board and holds focus', async ({
  page,
  open,
}) => {
  // The fragment's scroll after load sends focus to the page, which the dialog takes back.
  await open({ game: savedGame(), path: `/?p=${PUZZLE}#board` })
  const offer = page.getByRole('alertdialog', { name: 'Start this puzzle?' })
  await expect(offer).toContainText(
    'A puzzle was shared with WASudoku. Starting it replaces the current board.',
  )
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
  await expect(offer.getByRole('button', { name: 'Not now' })).toBeFocused()
})

test('a toast is a status, and stays on screen over a dialog opened after it', async ({
  page,
  open,
}) => {
  await open({ game: savedGame() })
  await makeProgress(page)
  await page.locator('#share-button').click()
  await page.getByRole('menuitem', { name: 'Copy board as text' }).click()
  const toast = page.getByRole('status').filter({ hasText: COPIED })
  await expect(toast).toBeVisible()
  await newPuzzle(page).click()
  await page.getByRole('menuitem', { name: 'Easy' }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Abandon current game?' })
  await expect(confirm).toBeVisible()
  await expect(confirm.getByRole('status').filter({ hasText: COPIED })).toBeVisible()
})

test('the New Puzzle menu opens below again once the window grows', async ({ page, open }) => {
  await page.setViewportSize(SHORT)
  await open({ game: savedGame() })
  await newPuzzle(page).click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  const below = async () => {
    const button = await newPuzzle(page).boundingBox()
    const box = await menu.boundingBox()
    return box !== null && button !== null && box.y >= button.y + button.height
  }
  await expect.poll(below).toBe(false)
  await page.setViewportSize(TALL)
  await expect.poll(below).toBe(true)
})
