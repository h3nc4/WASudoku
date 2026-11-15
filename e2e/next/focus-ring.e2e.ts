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

import type { Locator, Page } from '@playwright/test'

import { cell, expect, PUZZLE, savedGame, test } from './fixtures'

// Today's cells are text fields, which ring on any focus, and its menu buttons take no focus on a
// press. So a menu choice or a dialog after a key keeps the ring a mouse would drop.

const R1C1 = 0
const R1C3 = 2
const ringed = (target: Locator) => target.evaluate((e) => e.matches(':focus-visible'))
const share = (page: Page) => page.locator('#share-button')
const newPuzzle = (page: Page) => page.getByRole('button', { name: 'New Puzzle' })

/** The width of the inset ring a cell draws over its digit. */
const cellRing = (target: Locator) =>
  target.evaluate((e) => getComputedStyle(e).getPropertyValue('--ring-width').trim())

/** A paste with its own data, which the board reads without a clipboard permission. */
async function paste(target: Locator, text: string) {
  await target.click()
  await target.evaluate((element, data) => {
    const transfer = new DataTransfer()
    transfer.setData('text/plain', data)
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    element.dispatchEvent(event)
  }, text)
}

test('a cell rings once a pointer focuses it, as a text field does', async ({ page, open }) => {
  await open()
  await page.getByRole('button', { name: 'Create Your Own' }).click()
  await paste(cell(page, R1C1), PUZZLE)
  await expect(cell(page, R1C1)).toBeFocused()
  await expect(cell(page, R1C1)).not.toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => cellRing(cell(page, R1C1))).toBe('2px')
})

test("starting a typed-in puzzle drops focus from its cell, as today's app does", async ({
  page,
  open,
}) => {
  await open()
  await page.getByRole('button', { name: 'Create Your Own' }).click()
  await paste(cell(page, R1C1), PUZZLE)
  const startPuzzle = page.getByRole('button', { name: 'Start Puzzle' })
  await startPuzzle.click()
  await expect(startPuzzle).toBeHidden()
  await expect(cell(page, R1C1)).not.toBeFocused()
  await expect(page.locator('body')).toBeFocused()
})

// Firefox draws no ring on a cell after a key, so there the ring it carries is none.
test("a menu choice after a key carries the cell's ring to its button and the dialog", async ({
  page,
  open,
  browserName,
}) => {
  await open({ game: savedGame() })
  await cell(page, R1C3).click()
  await page.keyboard.press('4')
  const ring = await ringed(cell(page, R1C3))
  expect(ring).toBe(browserName !== 'firefox')
  await share(page).click()
  await page.getByRole('menuitem', { name: 'Copy puzzle link' }).click()
  await expect(share(page)).toBeFocused()
  expect(await ringed(share(page))).toBe(ring)
  await newPuzzle(page).click()
  await page.getByRole('menuitem', { name: 'Easy' }).click()
  const cancel = page
    .getByRole('alertdialog', { name: 'Abandon current game?' })
    .getByRole('button', { name: 'Cancel' })
  await expect(cancel).toBeFocused()
  expect(await ringed(cancel)).toBe(ring)
})

test('a menu choice by pointer alone leaves its button unringed', async ({ page, open }) => {
  await open({ game: savedGame() })
  await cell(page, R1C1).click()
  await share(page).click()
  await page.getByRole('menuitem', { name: 'Copy board as text' }).click()
  await expect(share(page)).toBeFocused()
  expect(await ringed(share(page))).toBe(false)
})
