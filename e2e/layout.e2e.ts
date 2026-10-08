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

import { board, cellFace, expect, PUZZLE, savedGame, test } from './fixtures'

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 900 }

/** The board's top edge in page coordinates. Scrolling to a button then leaves it unchanged. */
const boardTop = (page: Page) =>
  board(page).evaluate((grid) => grid.getBoundingClientRect().top + globalThis.scrollY)

test('play screen fits a 390x844 phone without vertical scroll', async ({ page, open }) => {
  await page.setViewportSize(PHONE)
  await open({ game: savedGame() })
  await expect(board(page)).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

for (const size of [PHONE, DESKTOP]) {
  test(`board stays in place when the hint strip opens at ${size.width}x${size.height}`, async ({
    page,
    open,
  }) => {
    await page.setViewportSize(size)
    await open({ game: savedGame() })
    await expect(page.getByRole('button', { name: 'Hint' })).toBeEnabled()
    // A late webfont would move the header, and with it the board.
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    const before = await boardTop(page)
    await page.getByRole('button', { name: 'Hint' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Hint' })).toBeVisible()
    expect(await boardTop(page)).toBeCloseTo(before, 1)
  })
}

/** Gap in CSS pixels between the lowest inked row of a cell's face and its bottom, or null with one band of ink. */
async function inkGap(page: Page, index: number): Promise<number | null> {
  const face = cellFace(page, index)
  const box = await face.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return {
      x: Math.ceil(r.left),
      y: Math.ceil(r.top),
      bottom: Math.floor(r.bottom),
      right: Math.floor(r.right),
    }
  })
  const clip = { x: box.x, y: box.y, width: box.right - box.x, height: box.bottom - box.y }
  const png = (await page.screenshot({ clip })).toString('base64')
  // Decoding the screenshot in the browser keeps an image library out of the test.
  const rows = await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.codePointAt(0) ?? 0)
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D
    context.drawImage(bitmap, 0, 0)
    const { data: px, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height)
    const at = (x: number, y: number) => px.slice((y * width + x) * 4, (y * width + x) * 4 + 3)
    const paper = at(1, height - 1)
    const inked = (x: number, y: number) =>
      at(x, y).reduce((sum, value, i) => sum + Math.abs(value - paper[i]), 0) > 60
    return Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => inked(x, y)).some(Boolean),
    )
  }, png)
  const scale = rows.length / clip.height
  const lowest = rows.lastIndexOf(true)
  const bandTop = rows.lastIndexOf(false, lowest) + 1
  // A clear row parts the digit from its underline. Ink with no clear row above it is the digit alone.
  if (!rows.slice(0, bandTop).includes(true)) return null
  return (rows.length - 1 - lowest) / scale
}

test('error underline clears the cell bottom at 390x844', async ({ page, open }) => {
  await page.setViewportSize(PHONE)
  // R1C3 answers 4 and R1C4 answers 6, so a tall 8 and a narrow 1 both read as wrong.
  const wrong: Record<number, string> = { 2: '8', 3: '1' }
  const played = [...PUZZLE].map((digit, i) => wrong[i] ?? digit).join('')
  await open({ game: savedGame({ board: played }) })
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  // The X behind a wrong digit reaches the cell edges, so it would read as the lowest ink.
  await page.addStyleTag({ content: '.error-mark { visibility: hidden }' })
  await expect(async () => {
    expect(await inkGap(page, 2)).toBeGreaterThanOrEqual(3)
    expect(await inkGap(page, 3)).toBeGreaterThanOrEqual(3)
  }).toPass()
})
