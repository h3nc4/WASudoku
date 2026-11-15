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

import { cell, digitOf, expect, expectAccessible, PUZZLE, savedGame, test } from './fixtures'

const steps = (page: import('@playwright/test').Page) =>
  page.locator('#solver-trace button[data-step]')
const current = (page: import('@playwright/test').Page) => page.locator('[aria-current="step"]')

test.describe('solve and the walkthrough', () => {
  test.beforeEach(async ({ open }) => {
    await open({ game: savedGame() })
  })

  test('reveal asks first, then the trace steps on the board', async ({ page }) => {
    await page.locator('#solve-button').click()
    const dialog = page.getByRole('alertdialog', { name: 'Reveal the solution?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Reveal solution' }).click()

    const panel = page.locator('#steps-panel')
    await expect(panel).toBeVisible()
    const total = await steps(page).count()
    expect(total).toBeGreaterThan(1)
    // The walkthrough opens at the solution, and the first row returns to the puzzle as given.
    await expect(page.locator('#step-count')).toHaveText(`${total}/${total}`)
    await expect(page.locator('[data-solved-in]')).toHaveText(`Solved in ${total} steps`)
    await page.locator('#step-start').click()
    await expect(page.locator('#step-start')).toHaveAttribute('aria-current', 'step')
    await expect(page.locator('#previous-step')).toBeDisabled()
    await expect(page.locator('#step-explanation')).toContainText('The puzzle as given.')
    await expect(page.locator('[data-solved-in]')).toBeHidden()

    await page.locator('#next-step').click()
    await expect(current(page)).toHaveAttribute('data-step', '1')
    await expect(page.locator('[role="gridcell"][data-placed]')).toHaveCount(1)
    await page.keyboard.press('ArrowRight')
    await expect(current(page)).toHaveAttribute('data-step', '2')
    await page.keyboard.press('ArrowLeft')
    await expect(current(page)).toHaveAttribute('data-step', '1')

    await page.locator('#step-end').click()
    await expect(page.locator('#next-step')).toBeDisabled()
    await expect(page.locator('[data-solved-in]')).toHaveText(`Solved in ${total} steps`)
    await expect(page.getByRole('radio', { name: 'Pen' })).toBeDisabled()
    await expectAccessible(page, 'walkthrough at the solution')

    await page.getByRole('button', { name: 'Exit Visualization' }).click()
    await expect(panel).toBeHidden()
    await expect(page.locator('#hint-button')).toBeVisible()
  })
})

test.describe('the walkthrough on a phone', () => {
  test.use({ viewport: { width: 412, height: 823 } })

  // The trace scrolls itself to the current row, and the page stays where the player left it.
  test('stepping scrolls the trace and never the page', async ({ page, open }) => {
    await open({ game: savedGame() })
    await page.locator('#solve-button').click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reveal solution' }).click()
    const trace = page.locator('#solver-trace')
    const inTrace = async (row: import('@playwright/test').Locator) => {
      const [box, view] = await Promise.all([row.boundingBox(), trace.boundingBox()])
      return (
        box !== null &&
        view !== null &&
        box.y >= view.y &&
        box.y + box.height <= view.y + view.height
      )
    }
    await expect.poll(() => inTrace(steps(page).last())).toBe(true)
    await page.locator('#step-start').click()
    await expect.poll(() => trace.evaluate((node) => node.scrollTop)).toBe(0)
    await page.locator('#next-step').click()
    await page.evaluate(() => {
      window.scrollTo(0, 0)
    })
    await page.keyboard.press('ArrowRight')
    await expect(current(page)).toHaveAttribute('data-step', '2')
    await expect.poll(() => inTrace(steps(page).nth(1))).toBe(true)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
  })
})

test.describe('a shared puzzle link', () => {
  test('offers the puzzle, which starts as a custom game', async ({ page, open }) => {
    await open({ path: `/?p=${PUZZLE}` })
    const dialog = page.getByRole('alertdialog', { name: 'Start this puzzle?' })
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
    await dialog.getByRole('button', { name: 'Start puzzle' }).click()
    await expect(page.locator('[data-status="difficulty"]')).toHaveText('Custom')
    await expect(cell(page, 0)).toHaveAttribute('aria-label', 'R1C1, 5, given')
    await expect(page.locator('#toasts')).toContainText(
      'Puzzle is valid and has a unique solution.',
    )
  })

  test('declined, it leaves the selection screen as it was', async ({ page, open }) => {
    await open({ path: `/?p=${PUZZLE}` })
    const dialog = page.getByRole('alertdialog', { name: 'Start this puzzle?' })
    await dialog.getByRole('button', { name: 'Not now' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Welcome to WASudoku' })).toBeVisible()
    await page.reload()
    await expect(dialog).toBeHidden()
  })

  test('the share menu copies a link to the puzzle', async ({
    page,
    open,
    browserName,
    context,
  }) => {
    if (browserName === 'chromium')
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await open({ game: savedGame() })
    await page.locator('#share-button').click()
    await page.getByRole('menuitem', { name: 'Copy puzzle link' }).click()
    await expect(page.locator('#toasts .toast')).toHaveText(
      /Puzzle link copied to clipboard\.|Failed to copy to clipboard\./,
    )
    if (browserName === 'chromium') {
      const copied = await page.evaluate(() => navigator.clipboard.readText())
      expect(new URL(copied).searchParams.get('p')).toBe(PUZZLE.replaceAll('0', '.'))
    }
  })
})

test('keyboard only: pick a puzzle, move, type, note and undo', async ({ page, open }) => {
  await open()
  await page.keyboard.press('Tab')
  await expect(page.locator('#share-button')).toBeFocused()
  const easy = page.locator('#selection-screen [data-difficulty="easy"]')
  await easy.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).not.toHaveAttribute('inert')

  // One tab stop for the whole grid, reached from the status bar.
  await page.locator('#pause-button').focus()
  await page.keyboard.press('Tab')
  await expect(cell(page, 0)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(cell(page, 2)).toBeFocused()
  await expect(cell(page, 2)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('4')
  await expect(digitOf(page, 2)).toHaveText('4')
  await page.keyboard.press('End')
  await expect(cell(page, 8)).toBeFocused()
  await page.keyboard.press('Home')
  await expect(cell(page, 0)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('n')
  await expect(page.getByRole('radio', { name: 'Corner' })).toBeChecked()
  await page.keyboard.press('2')
  await expect(cell(page, 3)).toHaveAttribute('aria-label', 'R1C4, empty, candidates 2')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(cell(page, 3)).toHaveAttribute('aria-label', 'R1C4, empty')
  await page.keyboard.press('Tab')
  await expect(cell(page, 3)).not.toBeFocused()
  await expect(cell(page, 3)).toHaveAttribute('tabindex', '0')
})
