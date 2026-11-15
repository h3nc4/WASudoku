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

import path from 'node:path'

import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Locator, type Page, test as base } from '@playwright/test'

import { fullPool, type GameMetrics, STORAGE_KEYS } from './saves'
import { serveSite } from './server'

const BUILD = path.resolve('dist')
const SEEDED_FLAG = 'wasudoku.e2e.seeded'
const ROW = 9

export interface OpenOptions {
  readonly path?: string
  /** Raw JSON for the saved game key. */
  readonly game?: string
  readonly metrics?: GameMetrics
  /** Seeds the puzzle pool. False leaves it empty, and the app then generates. */
  readonly pool?: boolean
}

/** The cell at an index, named by its position and contents. */
export const cell = (page: Page, index: number): Locator => page.locator(`#cell-${index}`)

/** The digit a cell shows, or the empty string. */
export const digitOf = (page: Page, index: number): Locator => cell(page, index).locator('.d')

export const notesOf = (page: Page, index: number): Locator => cell(page, index).locator('.n')

/** The cell by today's face test id, whose text is its digit or its notes run together. */
export const faceOf = (page: Page, index: number): Locator =>
  page.getByTestId('cell-background').and(cell(page, index))

export const padKey = (page: Page, digit: number): Locator =>
  page.getByRole('button', { name: new RegExp(`^Enter number ${digit}\\b`) })

export const mistakes = (page: Page): Locator => page.locator('[data-status="mistakes"]')

export const timer = (page: Page): Locator => page.locator('[data-status="time"]')

export const board = (page: Page): Locator => page.getByRole('grid')

export const difficulty = (page: Page): Locator => page.locator('[data-status="difficulty"]')

/** The hint strip, open while it has the data-open flag. */
export const hintStrip = (page: Page): Locator => page.locator('#hint-slot[data-open]')

/** Headless pages are never hidden, so the visibility change is staged. */
export async function hideDocument(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

/** The 81 digits on the board, a dot for an empty cell. */
export const readBoard = (page: Page): Promise<string> =>
  page.evaluate(() =>
    Array.from(
      { length: 81 },
      (_, i) => document.querySelector(`#cell-${i} > .d`)?.textContent ?? '.',
    ).join(''),
  )

export async function readTimer(page: Page): Promise<number> {
  const [minutes = 0, seconds = 0] = (await timer(page).innerText()).split(':').map(Number)
  return minutes * 60 + seconds
}

/** Dispatches a paste with its own data, which the board reads without a clipboard permission. */
export async function paste(target: Locator, text: string) {
  await target.evaluate((element, data) => {
    const transfer = new DataTransfer()
    transfer.setData('text/plain', data)
    // Firefox drops clipboardData passed to the ClipboardEvent constructor, so it is set on the event.
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    element.dispatchEvent(event)
  }, text)
}

/** Scans the page as it stands and fails only on serious and critical violations. */
export async function expectAccessible(page: Page, state: string) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  const blocking = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ rule: v.id, targets: v.nodes.map((n) => n.target.join(' ')) }))
  expect(blocking, `axe violations in ${state}`).toEqual([])
}

interface Fixtures {
  readonly open: (options?: OpenOptions) => Promise<void>
  /** Errors the page threw. Every test fails if one is recorded. */
  readonly errors: string[]
}

export const test = base.extend<Fixtures, { site: string }>({
  site: [
    // A worker fixture must destructure its dependencies, and this one needs none of them.
    async ({ playwright: _playwright }, run) => {
      const server = await serveSite(BUILD)
      await run(server.url)
      await server.close()
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ site }, run) => {
    await run(site)
  },
  errors: async ({ page }, run) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await run(errors)
    expect(errors, 'errors the page threw').toEqual([])
  },
  // Seeds storage once per tab. A reload then reads what the app saved rather than the seed.
  open: async ({ page, errors: _errors }, run) => {
    await run(async (options = {}) => {
      const { path: at = '/', game, metrics, pool = true } = options
      const entries: [string, string][] = []
      if (game) entries.push([STORAGE_KEYS.GAME, game])
      if (metrics) entries.push([STORAGE_KEYS.METRICS, JSON.stringify(metrics)])
      if (pool) entries.push([STORAGE_KEYS.POOL, fullPool()])
      await page.addInitScript(
        ({ flag, items }) => {
          if (sessionStorage.getItem(flag)) return
          sessionStorage.setItem(flag, '1')
          for (const [key, value] of items) localStorage.setItem(key, value)
        },
        { flag: SEEDED_FLAG, items: entries },
      )
      await page.goto(at)
    })
  },
})

export const cellName = (index: number): string =>
  `R${Math.floor(index / ROW) + 1}C${(index % ROW) + 1}`

export { expect }
export {
  AMBIGUOUS,
  legacyGame,
  PUZZLE,
  savedGame,
  selectionScreenSave,
  SOLUTION,
  solvedExcept,
  STORAGE_KEYS,
} from './saves'
