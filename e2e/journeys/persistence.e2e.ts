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
  cell,
  difficulty,
  digitOf,
  expect,
  faceOf,
  legacyGame,
  mistakes,
  PUZZLE,
  readTimer,
  savedGame,
  selectionScreenSave,
  STORAGE_KEYS,
  test,
  timer,
} from '../fixtures'

const R1C3 = 2
const R1C4 = 3
// Longer than the idle timeout after which the app writes the game, run on the fake clock.
const PAST_SAVE_DELAY_MS = 2000

const welcome = (page: Page) => page.getByRole('heading', { name: 'Welcome to WASudoku' })
const storedGame = (page: Page) =>
  page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.GAME)

test('reload mid-game restores board, notes and timer', async ({ page, open }) => {
  await open({ game: savedGame(), metrics: { timer: 65, mistakes: 1 } })
  await expect(mistakes(page)).toHaveText('1/3')
  expect(await readTimer(page)).toBeGreaterThanOrEqual(65)

  await cell(page, R1C3).click()
  await page.keyboard.press('4')
  await page.getByRole('radio', { name: 'Corner' }).click()
  await cell(page, R1C4).click()
  await page.keyboard.press('2')
  await page.keyboard.press('6')
  await expect(faceOf(page, R1C4)).toHaveText('26')
  const before = await readTimer(page)

  await page.reload()
  await expect(digitOf(page, R1C3)).toHaveText('4')
  await expect(faceOf(page, R1C4)).toHaveText('26')
  await expect(mistakes(page)).toHaveText('1/3')
  expect(await readTimer(page)).toBeGreaterThanOrEqual(before)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()
})

test('a move saves in the version 2 format', async ({ page, open }) => {
  const start = JSON.parse(savedGame()) as { history: { stack: string[] } }
  const placed = JSON.parse(
    savedGame({ board: `${PUZZLE.slice(0, R1C3)}4${PUZZLE.slice(R1C3 + 1)}` }),
  ) as { history: { stack: string[] } }
  await open({ game: savedGame() })

  await cell(page, R1C3).click()
  await page.keyboard.press('4')

  const read = async () => JSON.parse((await storedGame(page)) ?? '{}') as unknown
  const expected = {
    ...start,
    history: { stack: [...start.history.stack, placed.history.stack[1]], index: 2 },
  }
  await expect(async () => expect(await read()).toEqual(expected)).toPass()
})

test('save in the legacy Set-tagged format migrates on load', async ({ page, open }) => {
  await open({ game: legacyGame() })
  await expect(difficulty(page)).toHaveText('Medium')
  await expect(digitOf(page, R1C3)).toHaveText('4')
  await expect(faceOf(page, R1C4)).toHaveText('26')

  const saved = await storedGame(page)
  expect(JSON.parse(saved ?? '{}')).toMatchObject({ version: 2, difficulty: 'medium' })

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(digitOf(page, R1C3)).toHaveCount(0)
})

test('reload from the untouched selection screen keeps the selection screen', async ({
  page,
  open,
}) => {
  await page.clock.install()
  await open()
  await expect(welcome(page)).toBeVisible()
  await page.clock.runFor(PAST_SAVE_DELAY_MS)

  await page.reload()
  await expect(welcome(page)).toBeVisible()
  await expect(timer(page)).toBeHidden()
  expect(await storedGame(page)).toBeNull()
})

test('empty game saved by an earlier build opens the selection screen', async ({ page, open }) => {
  await open({ game: selectionScreenSave() })
  await expect(welcome(page)).toBeVisible()
  await expect(timer(page)).toBeHidden()
})

test('corrupt game keeps the metrics saved beside it', async ({ page, open }) => {
  await page.clock.install()
  await open({ game: '{"version":2,"history":', metrics: { timer: 30, mistakes: 2 } })
  await expect(welcome(page)).toBeVisible()
  await page.clock.runFor(PAST_SAVE_DELAY_MS)
  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.METRICS)
  expect(stored).toBe('{"timer":30,"mistakes":2}')
})
