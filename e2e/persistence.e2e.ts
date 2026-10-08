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

import { STORAGE_KEYS } from '../src/context/sudoku.persistence'
import {
  cell,
  cellFace,
  expect,
  mistakes,
  PUZZLE,
  readTimer,
  savedGame,
  SOLUTION,
  test,
} from './fixtures'

const R1C3 = 2
const R1C4 = 3

/** Each Set saved as {"__dataType":"Set","value":[...]}, the format of builds before version 2. */
function legacyGame(): string {
  const tagged = (digits: number[]) => ({ __dataType: 'Set', value: digits })
  const toCells = (digits: string, entries: Record<number, number> = {}) =>
    [...digits].map((char, i) => ({
      value: entries[i] ?? (char === '0' ? null : Number(char)),
      isGiven: char !== '0',
      candidates: tagged([]),
      centers: tagged(i === R1C4 ? [2, 6] : []),
    }))
  const initialBoard = toCells(PUZZLE)
  return JSON.stringify({
    history: { stack: [initialBoard, toCells(PUZZLE, { [R1C3]: 4 })], index: 1 },
    initialBoard,
    solution: [...SOLUTION].map(Number),
    difficulty: 'medium',
  })
}

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
  await expect(cellFace(page, R1C4)).toHaveText('26')
  const before = await readTimer(page)

  await page.reload()
  await expect(cell(page, R1C3)).toHaveValue('4')
  await expect(cellFace(page, R1C4)).toHaveText('26')
  await expect(mistakes(page)).toHaveText('1/3')
  expect(await readTimer(page)).toBeGreaterThanOrEqual(before)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled()
})

test('save in the legacy Set-tagged format migrates on load', async ({ page, open }) => {
  await open({ game: legacyGame() })
  await expect(page.getByText('Medium', { exact: true })).toBeVisible()
  await expect(cell(page, R1C3)).toHaveValue('4')
  await expect(cellFace(page, R1C4)).toHaveText('26')

  const saved = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.GAME)
  expect(JSON.parse(saved ?? '{}')).toMatchObject({ version: 2, difficulty: 'medium' })

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(cell(page, R1C3)).toHaveValue('')
})
