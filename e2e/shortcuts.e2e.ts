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

import { cell, expect, expectAccessible, savedGame, test } from './fixtures'

const shortcuts = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' })

test('? opens the shortcuts list from the board, and Esc hands focus back', async ({
  page,
  open,
}) => {
  await open({ game: savedGame() })
  await cell(page, 0).focus()
  await page.keyboard.press('Shift+?')
  const dialog = shortcuts(page)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
  await expect(dialog.getByRole('rowheader', { name: /^Ctrl\s*\+\s*Z$/ })).toBeVisible()
  await expect(dialog).toContainText('On macOS, Cmd works in place of Ctrl.')
  await expectAccessible(page, 'the shortcuts dialog')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(cell(page, 0)).toBeFocused()
})

test('the header button opens the shortcuts list, and Close hands focus back', async ({
  page,
  open,
}) => {
  await open({ game: savedGame() })
  const button = page.getByRole('button', { name: 'Keyboard shortcuts' })
  // Safari doesn't focus a clicked button. The keyboard press gives focus return a button to go to.
  await button.focus()
  await page.keyboard.press('Enter')
  const dialog = shortcuts(page)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Close' }).press('Enter')
  await expect(dialog).toBeHidden()
  await expect(button).toBeFocused()
})
