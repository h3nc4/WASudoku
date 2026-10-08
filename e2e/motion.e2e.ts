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

import { cell, expect, savedGame, solvedExcept, test } from './fixtures'

test.use({ reducedMotion: 'no-preference' })

const R1C3 = 2
const R1C4 = 3
const LAST = 78

/** Animations and transitions still playing, by name, so a failure says which one is stuck. */
const running = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => {
        if (a instanceof CSSAnimation) return a.animationName
        if (a instanceof CSSTransition) return a.transitionProperty
        return a.id || 'script animation'
      }),
  )

test('with motion on, no animation is left running once the board settles', async ({
  page,
  open,
}) => {
  await open({ game: savedGame({ board: solvedExcept(R1C3, R1C4, LAST) }) })

  await page.getByRole('radio', { name: 'Corner' }).click()
  await cell(page, R1C3).click()
  await page.keyboard.press('4')
  await page.keyboard.press('4')
  await page.getByRole('radio', { name: 'Pen' }).click()
  await page.keyboard.press('4')
  await cell(page, R1C4).click()
  await page.keyboard.press('1')
  await page.keyboard.press('Delete')
  await page.keyboard.press('6')

  await page.getByRole('button', { name: 'Pause game' }).click()
  await page.getByRole('button', { name: 'Resume', exact: true }).click()

  await cell(page, LAST).click()
  await page.keyboard.press('1')
  const dialog = page.getByRole('dialog', { name: 'Puzzle solved' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await expect.poll(() => running(page), { timeout: 5000 }).toEqual([])
})

/** Started conflict pulses once the timeline reaches `at`, read in the page so no round trip delays it. */
const pulses = (page: Page, at = 0) =>
  page.evaluate(
    (at) =>
      new Promise<{ name: string; start: number; now: number }[]>((resolve) => {
        const step = () => {
          const now = Number(document.timeline.currentTime)
          if (now < at) return requestAnimationFrame(step)
          resolve(
            document
              .getAnimations()
              .filter((a) => a instanceof CSSAnimation && a.animationName.startsWith('conflict'))
              .filter((a) => a.startTime !== null)
              .map((a) => ({
                name: (a as CSSAnimation).animationName,
                start: Number(a.startTime),
                now,
              })),
          )
        }
        step()
      }),
    at,
  )

const names = async (page: Page) => (await pulses(page)).map((p) => p.name)

test('a second clash 300ms into the pulse replays it from the start', async ({ page, open }) => {
  const tick = { intervals: [10] }
  await open({ game: savedGame() })
  await page.getByRole('radio', { name: 'Corner' }).click()
  await cell(page, R1C3).click()

  // A 5 note here clashes with the 5 already in row 1.
  await page.keyboard.press('5')
  await expect.poll(() => names(page), tick).toEqual(['conflict-pulse-a'])
  const [first] = await pulses(page)

  await pulses(page, first.start + 300)
  await page.keyboard.press('5')
  await expect.poll(() => names(page), tick).toEqual(['conflict-pulse-b'])
  const [second] = await pulses(page)
  expect(second.start - first.start).toBeGreaterThanOrEqual(300)

  // The first pulse ends 600ms after its start, so the one still running past that is the replay.
  const later = await pulses(page, Math.max(first.start + 650, second.start + 50))
  expect(later).toMatchObject([{ name: 'conflict-pulse-b', start: second.start }])
  expect(later[0].now - second.start).toBeLessThan(600)
})
