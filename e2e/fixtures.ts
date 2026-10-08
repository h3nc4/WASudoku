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

import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Locator, type Page, test as base } from '@playwright/test'

import { encodeGame, STORAGE_KEYS } from '../src/context/sudoku.persistence'
import {
  type BoardState,
  DIFFICULTIES,
  type Difficulty,
  type GameMetrics,
  type PuzzleData,
} from '../src/context/sudoku.types'

/** A puzzle with one solution that singles alone solve, so a hint always has a logical step. */
export const PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
export const SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179'

/** A puzzle with many solutions, since it has nothing but the clues 1 and 2. */
export const AMBIGUOUS = `12${'.'.repeat(79)}`

const SEEDED_FLAG = 'wasudoku.e2e.seeded'

export interface SavedGameSpec {
  /** The board as played, as 81 digits or dots. Cells that differ from the puzzle are player entries. */
  readonly board?: string
  readonly difficulty?: Difficulty | null
  readonly notes?: Readonly<Record<number, { candidates?: number[]; centers?: number[] }>>
  readonly metrics?: GameMetrics
}

const toBoard = (digits: string, givens: string, notes: SavedGameSpec['notes'] = {}): BoardState =>
  [...digits].map((char, i) => ({
    value: char === '.' || char === '0' ? null : Number(char),
    isGiven: givens[i] !== '.' && givens[i] !== '0',
    candidates: new Set(notes[i]?.candidates ?? []),
    centers: new Set(notes[i]?.centers ?? []),
  }))

/** The puzzle with every cell but the listed ones filled from the solution. */
export function solvedExcept(...blanks: number[]): string {
  const clue = blanks.find((i) => PUZZLE[i] !== '0')
  if (clue !== undefined) throw new Error(`Cell ${clue} is a clue and cannot be left blank`)
  return [...SOLUTION].map((digit, i) => (blanks.includes(i) ? '.' : digit)).join('')
}

/** A saved game in the current storage format, built by the app's own encoder. */
export function savedGame(spec: SavedGameSpec = {}): string {
  const initialBoard = toBoard(PUZZLE, PUZZLE)
  const board = toBoard(spec.board ?? PUZZLE, PUZZLE, spec.notes)
  return JSON.stringify(
    encodeGame({
      history: { stack: [initialBoard, board], index: 1 },
      initialBoard,
      solution: [...SOLUTION].map(Number),
      difficulty: spec.difficulty === undefined ? 'easy' : spec.difficulty,
    }),
  )
}

/** A full pool of the fixed puzzle, which keeps the app from generating in the background. */
export const fullPool = (): string => {
  const entry: PuzzleData = { puzzleString: PUZZLE, solutionString: SOLUTION }
  const puzzlePool = Object.fromEntries(DIFFICULTIES.map((d) => [d, [entry, entry, entry]]))
  return JSON.stringify({ puzzlePool })
}

export interface OpenOptions {
  readonly path?: string
  /** Raw JSON for the saved game key, as the app or an older build wrote it. */
  readonly game?: string
  readonly metrics?: GameMetrics
  /** Seeds the puzzle pool, which every test does except the one about real generation. */
  readonly pool?: boolean
}

/** Seeds storage once per tab. A reload then finds what the app saved, not the seed. */
async function open(page: Page, options: OpenOptions = {}) {
  const { path = '/', game, metrics, pool = true } = options
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
  await page.goto(path)
}

const ROW = 9

/** The cell's input, whose value is the digit and whose accessible name is its position. */
export const cell = (page: Page, index: number): Locator =>
  page.getByRole('textbox', {
    name: `Sudoku cell at row ${Math.floor(index / ROW) + 1}, column ${(index % ROW) + 1}`,
    exact: true,
  })

/** The layer that draws a cell's digit or its notes. */
export const cellFace = (page: Page, index: number): Locator =>
  page.locator(`#cell-${index}`).locator('xpath=..').getByTestId('cell-background')

/** The X drawn across a cell holding a wrong or clashing digit. */
export const errorMark = (page: Page, index: number): Locator =>
  cellFace(page, index).getByTestId('cell-error-mark')

export const board = (page: Page): Locator => page.getByRole('grid')

export const padKey = (page: Page, digit: number): Locator =>
  page.getByRole('button', { name: `Enter number ${digit}`, exact: true })

export const mistakes = (page: Page): Locator => page.getByText(/^\d\/3$/)

export const timer = (page: Page): Locator => page.getByText(/^\d{2}:\d{2}$/)

/** Reads the 81 digits shown on the board, with a dot for an empty cell. */
export const readBoard = (page: Page): Promise<string> =>
  page.evaluate(() =>
    Array.from({ length: 81 }, (_, i) => {
      const input = document.getElementById(`cell-${i}`) as HTMLInputElement | null
      return input?.value || '.'
    }).join(''),
  )

/** Seconds on the game clock. */
export async function readTimer(page: Page): Promise<number> {
  const [minutes, seconds] = (await timer(page).innerText()).split(':').map(Number)
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

/** Headless pages are never hidden, so the visibility change is staged. */
export async function hideDocument(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

/** Scans the page as it stands and fails only on serious and critical violations. */
export async function expectAccessible(page: Page, state: string) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  const blocking = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      rule: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target.join(' ')),
    }))
  expect(blocking, `axe violations in ${state}`).toEqual([])
}

export const test = base.extend<{ open: (options?: OpenOptions) => Promise<void> }>({
  open: async ({ page }, run) => {
    await run((options) => open(page, options))
  },
})

export { expect }
