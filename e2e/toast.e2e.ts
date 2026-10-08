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

import { board, cell, expect, paste, savedGame, test } from './fixtures'

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 720 }

type Box = { x: number; y: number; width: number; height: number }

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

const stepsPanel = (page: Page) =>
  page.getByRole('heading', { name: 'Solving Steps' }).locator('xpath=../..')

const shownToast = (page: Page, text: string) =>
  page.locator('[data-sonner-toast][data-mounted="true"]').filter({ hasText: text })

/** Every toast on screen is inside the viewport and covers none of the given regions. */
async function expectToastsClear(page: Page, text: string, regions: Locator[]) {
  await expect(shownToast(page, text)).toBeVisible()
  const viewport = page.viewportSize()!
  // The toaster moves on scroll in a later frame, so the geometry is polled.
  await expect(async () => {
    const toasts = await page.locator('[data-sonner-toast]').all()
    const shown = await shownToast(page, text).boundingBox()
    expect(shown!.y).toBeGreaterThanOrEqual(0)
    expect(shown!.y + shown!.height).toBeLessThanOrEqual(viewport.height)
    for (const toast of toasts) {
      const box = await toast.boundingBox()
      if (!box) continue
      for (const region of regions) {
        const area = await region.boundingBox()
        expect(
          area && overlaps(box, area),
          `toast over ${await region.evaluate((e) => e.outerHTML.slice(0, 60))}`,
        ).toBeFalsy()
      }
    }
  }).toPass({ timeout: 2000 })
}

async function startWalkthrough(page: Page) {
  await page.getByRole('button', { name: 'Solve' }).click()
  await page
    .getByRole('dialog', { name: 'Reveal the solution?' })
    .getByRole('button', { name: 'Reveal solution' })
    .click()
  await expect(stepsPanel(page)).toBeVisible()
}

test.describe('on a 390x844 phone', () => {
  test.use({ viewport: PHONE })

  test('play toasts sit at the bottom centre, clear of the board', async ({ page, open }) => {
    await open({ game: savedGame() })
    await cell(page, 2).click()
    await page.keyboard.press('4')
    await page.getByRole('button', { name: 'Clear Board' }).click()
    await expectToastsClear(page, 'Board cleared.', [board(page)])
    const box = (await shownToast(page, 'Board cleared.').boundingBox())!
    expect(box.x + box.width / 2).toBeCloseTo(PHONE.width / 2, 0)
    expect(box.y + box.height).toBeCloseTo(PHONE.height - 16, 0)
  })

  test('walkthrough toast stays off the board and the steps panel while scrolling', async ({
    page,
    open,
  }) => {
    await open({ game: savedGame() })
    await startWalkthrough(page)
    const text = 'Solver finished.'
    await expectToastsClear(page, text, [board(page), stepsPanel(page)])

    await stepsPanel(page).scrollIntoViewIfNeeded()
    await expect(stepsPanel(page)).toBeInViewport({ ratio: 1 })
    await expectToastsClear(page, text, [board(page), stepsPanel(page)])

    await page.evaluate(() => globalThis.scrollTo(0, document.documentElement.scrollHeight))
    await expectToastsClear(page, text, [board(page), stepsPanel(page)])
  })

  test('custom input toasts stay off the board', async ({ page, open }) => {
    await open()
    await page.getByRole('button', { name: 'Create Your Own' }).click()
    await cell(page, 0).click()
    await paste(cell(page, 0), 'not a sudoku')
    await expectToastsClear(page, 'Invalid board format in clipboard.', [board(page)])
  })
})

test.describe('on a desktop', () => {
  test.use({ viewport: DESKTOP })

  test('toasts in play and walkthrough stay off the board and the steps panel', async ({
    page,
    open,
  }) => {
    await open({ game: savedGame() })
    await cell(page, 2).click()
    await page.keyboard.press('4')
    await page.getByRole('button', { name: 'Clear Board' }).click()
    await expectToastsClear(page, 'Board cleared.', [board(page)])

    await startWalkthrough(page)
    await expectToastsClear(page, 'Solver finished.', [board(page), stepsPanel(page)])
  })
})
