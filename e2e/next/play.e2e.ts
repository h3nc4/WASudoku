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

import {
  cell,
  digitOf,
  expect,
  expectAccessible,
  mistakes,
  notesOf,
  padKey,
  readBoard,
  savedGame,
  SOLUTION,
  solvedExcept,
  test,
  timer,
} from './fixtures'

const WELCOME = 'Welcome to WASudoku'
const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Expert', 'Extreme'] as const
// R1C3 takes 1, 2 or 4 and its answer is 4. R1C4 takes 2 or 6.
const R1C3 = 2
const R1C4 = 3

test.describe('first visit', () => {
  test('shows the selection screen over an inert board', async ({ page, open }) => {
    await open()
    await expect(page.getByRole('heading', { name: WELCOME })).toBeVisible()
    await expect(page.locator('main')).toHaveAttribute('inert')
    await expect(page.locator('#game-status')).toBeHidden()
    await expectAccessible(page, 'first visit')
  })

  test('generates a puzzle of each difficulty', async ({ page, open }) => {
    test.setTimeout(120_000)
    await open({ pool: false })
    await page.getByRole('button', { name: 'Easy', exact: true }).click()
    for (const difficulty of DIFFICULTIES) {
      if (difficulty !== 'Easy') {
        await page.locator('#new-button').click()
        await page.getByRole('menuitem', { name: difficulty }).click()
      }
      await expect(page.locator('[data-status="difficulty"]')).toHaveText(difficulty, {
        timeout: 30_000,
      })
      await expect(page.locator('main')).not.toHaveAttribute('inert')
      const givens = await page.locator('[role="gridcell"][aria-readonly="true"]').count()
      expect(givens, `${difficulty} givens`).toBeGreaterThan(16)
      expect(givens, `${difficulty} givens`).toBeLessThan(81)
    }
  })

  test('opens a shortcut puzzle from the query and drops it', async ({ page, open }) => {
    await open({ path: '/?new=hard' })
    await expect(page.locator('[data-status="difficulty"]')).toHaveText('Hard')
    await expect(page).toHaveURL(/\/$/)
  })
})

test.describe('play', () => {
  test.beforeEach(async ({ open }) => {
    await open({ game: savedGame() })
  })

  test('pen digits from keys and the pad, erase, undo and redo', async ({ page }) => {
    await cell(page, R1C3).click()
    await page.keyboard.press('4')
    await expect(digitOf(page, R1C3)).toHaveText('4')
    await expect(cell(page, R1C3)).toBeFocused()

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(digitOf(page, R1C3)).toHaveCount(0)
    await page.getByRole('button', { name: 'Redo' }).click()
    await expect(digitOf(page, R1C3)).toHaveText('4')
    await page.keyboard.press('ControlOrMeta+z')
    await expect(digitOf(page, R1C3)).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+y')
    await expect(digitOf(page, R1C3)).toHaveText('4')

    await page.getByRole('button', { name: 'Erase selected cell' }).click()
    await expect(digitOf(page, R1C3)).toHaveCount(0)
    await padKey(page, 4).click()
    await expect(digitOf(page, R1C3)).toHaveText('4')
    await expect(padKey(page, 4)).toHaveAccessibleName(/, \d left$/)
  })

  test('corner and center notes, a conflict and the mistakes counter', async ({ page }) => {
    await page.getByRole('radio', { name: 'Corner' }).click()
    await cell(page, R1C3).click()
    for (const key of ['1', '2', '4']) await page.keyboard.press(key)
    await expect(notesOf(page, R1C3)).toHaveText('124')
    await expect(cell(page, R1C3)).toHaveAttribute('aria-label', 'R1C3, empty, candidates 1, 2, 4')

    await page.getByRole('radio', { name: 'Center' }).click()
    await cell(page, R1C4).click()
    for (const key of ['2', '6']) await page.keyboard.press(key)
    await expect(notesOf(page, R1C4)).toHaveAttribute('data-center', 'few')
    await expect(notesOf(page, R1C4)).toHaveText('26')

    await page.getByRole('radio', { name: 'Pen' }).click()
    await cell(page, R1C3).click()
    await page.keyboard.press('5')
    await expect(cell(page, R1C3)).toHaveAttribute('aria-invalid', 'true')
    await expect(cell(page, R1C3).locator('svg.x')).toBeVisible()
    await expect(mistakes(page)).toHaveText('1/3')
    await expect(page.locator('#announcer')).toHaveText('1 mistake so far.')
    await expect(page.locator('#solve-button')).toBeDisabled()
    await expect(page.locator('#solve-button')).toHaveAttribute(
      'title',
      'Cannot solve with conflicts.',
    )
    await expectAccessible(page, 'board with a conflict')
  })

  test('clears the board and undoes it from the toast', async ({ page }) => {
    await cell(page, R1C3).click()
    await page.keyboard.press('4')
    await page.locator('#clear-button').click()
    await expect(digitOf(page, R1C3)).toHaveCount(0)
    const toast = page.locator('#toasts .toast', { hasText: 'Board cleared.' })
    await toast.getByRole('button', { name: 'Undo' }).click()
    await expect(digitOf(page, R1C3)).toHaveText('4')
  })

  test('a hint opens below the board and marks its cells', async ({ page }) => {
    await page.locator('#hint-button').click()
    const strip = page.locator('#hint-slot')
    await expect(strip).toHaveAttribute('data-open', '')
    await expect(strip.locator('[data-hint="text"]')).not.toBeEmpty()
    await expect(page.locator('[role="gridcell"][data-target]')).not.toHaveCount(0)
    await page.getByRole('button', { name: 'Dismiss hint' }).click()
    await expect(strip).not.toHaveAttribute('data-open')
    await expect(page.locator('[role="gridcell"][data-target]')).toHaveCount(0)
  })

  test('pauses behind an overlay and resumes', async ({ page }) => {
    await page.getByRole('button', { name: 'Pause game' }).click()
    await expect(page.locator('#pause-overlay')).toBeVisible()
    await expect(page.locator('#board')).toHaveAttribute('data-paused', '')
    const frozen = await timer(page).innerText()
    await page.waitForTimeout(1_200)
    await expect(timer(page)).toHaveText(frozen)
    await page.getByRole('button', { name: 'Resume', exact: true }).click()
    await expect(page.locator('#pause-overlay')).toBeHidden()
    await expect(timer(page)).not.toHaveText(frozen, { timeout: 3_000 })
  })

  test('the status bar button turns into resume while paused', async ({ page }) => {
    await page.getByRole('button', { name: 'Pause game' }).click()
    await expect(page.locator('#pause-overlay')).toBeVisible()
    await page.getByRole('button', { name: 'Resume game' }).click()
    await expect(page.locator('#pause-overlay')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Pause game' })).toBeVisible()
  })

  test('asks before a shortcut puzzle replaces the game in progress', async ({ page }) => {
    await cell(page, R1C3).click()
    await page.keyboard.press('4')
    await expect(digitOf(page, R1C3)).toHaveText('4')
    await page.goto('/?new=hard')
    await expect(page.locator('#abandon-dialog')).toBeVisible()
    await page.locator('#abandon-dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(digitOf(page, R1C3)).toHaveText('4')
    await expect(page.locator('[data-status="difficulty"]')).toHaveText('Easy')
  })

  test('a reload restores the game in progress', async ({ page }) => {
    await cell(page, R1C3).click()
    await page.keyboard.press('4')
    await page.reload()
    await expect(digitOf(page, R1C3)).toHaveText('4')
    await expect(page.locator('[data-status="difficulty"]')).toHaveText('Easy')
  })

  test('the theme toggle flips and remembers the theme', async ({ page }) => {
    const root = page.locator('html')
    const before = await root.getAttribute('data-theme')
    await page.locator('#theme-button').click()
    const after = before === 'light' ? 'dark' : 'light'
    await expect(root).toHaveAttribute('data-theme', after)
    await page.reload()
    await expect(root).toHaveAttribute('data-theme', after)
  })
})

test('the last digit wins, and the win dialog starts another puzzle', async ({ page, open }) => {
  await open({ game: savedGame({ board: solvedExcept(R1C3) }) })
  await cell(page, R1C3).click()
  await page.keyboard.press(SOLUTION[R1C3] ?? '')
  const dialog = page.getByRole('dialog', { name: 'Puzzle solved' })
  await expect(dialog).toBeVisible()
  await expect(page.locator('#win-summary')).toHaveText(
    /^Easy puzzle finished in \d\d:\d\d with 0 mistakes\.$/,
  )
  await expect(page.locator('[data-status="solved"]')).toBeVisible()
  await expect(page.locator('#pause-button')).toBeHidden()
  await expectAccessible(page, 'win dialog')
  await dialog.getByRole('button', { name: 'Medium' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('[data-status="difficulty"]')).toHaveText('Medium')
  expect(await readBoard(page)).not.toBe(SOLUTION)
})
