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

import type { Locator, Page } from 'playwright'

import {
  AMBIGUOUS,
  fullPool,
  legacyGame,
  PUZZLE,
  savedGame,
  selectionScreenSave,
  solvedExcept,
  STORAGE_KEYS,
} from '../e2e/saves.ts'
import { type Session, settle } from './browser.ts'

/** Deep enough that picking every difficulty once never drops a level below the refill mark. */
const POOL_DEPTH = 6
export const POOL: readonly [string, string] = [STORAGE_KEYS.POOL, fullPool(POOL_DEPTH)]

const metrics = (timer: number, mistakes: number): readonly [string, string] => [
  STORAGE_KEYS.METRICS,
  JSON.stringify({ timer, mistakes }),
]
const game = (save: string): readonly [string, string] => [STORAGE_KEYS.GAME, save]

const ROW = 9
// Cells of PUZZLE, where R1C1 holds a given 5 and the answers are 4 at R1C3, 6 at R1C4, 8 at R1C6 and 1 at R9C7.
const R1C1 = 0
const R1C3 = 2
const R1C4 = 3
const R1C6 = 5
const R1C7 = 6
const R9C7 = 78

/** Steps through the contract: roles and accessible names the rewrite keeps verbatim. */
export class Driver {
  readonly session: Session
  readonly page: Page
  private readonly onCapture: (label: string) => Promise<void>

  constructor(session: Session, onCapture: (label: string) => Promise<void>) {
    this.session = session
    this.page = session.page
    this.onCapture = onCapture
  }

  capture = (label: string) => this.onCapture(label)
  settle = () => settle(this.session)

  /** A reference cell is a named textbox, a candidate cell a gridcell named such as R1C3, empty. */
  cell = (index: number): Locator => {
    const [row, column] = [Math.floor(index / ROW) + 1, (index % ROW) + 1]
    return this.page
      .getByRole('textbox', { name: `Sudoku cell at row ${row}, column ${column}`, exact: true })
      .or(this.page.getByRole('gridcell', { name: new RegExp(`^R${row}C${column},`) }))
  }

  button = (name: string, exact = true): Locator => this.page.getByRole('button', { name, exact })
  pad = (digit: number): Locator =>
    this.page.getByRole('button', { name: new RegExp(`^Enter number ${digit}\\b`) })

  async click(target: Locator) {
    await target.click()
    await this.settle()
  }

  async press(key: string) {
    await this.page.keyboard.press(key)
    await this.settle()
  }

  async type(index: number, ...keys: string[]) {
    await this.cell(index).click()
    for (const key of keys) await this.page.keyboard.press(key)
    await this.settle()
  }

  async mode(name: 'Pen' | 'Corner' | 'Center') {
    await this.click(this.page.getByRole('radio', { name, exact: true }))
  }

  async menu(trigger: string, item: string) {
    await this.click(this.button(trigger))
    await this.click(this.page.getByRole('menuitem', { name: item, exact: true }))
  }

  /** A paste with its own data, which the board reads without a clipboard permission. */
  async paste(index: number, text: string) {
    await this.cell(index).click()
    await this.cell(index).evaluate((element, data) => {
      const transfer = new DataTransfer()
      transfer.setData('text/plain', data)
      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: transfer })
      element.dispatchEvent(event)
    }, text)
    await this.settle()
  }

  /** The walkthrough counter, position over step count, such as 07/51. */
  async counter(): Promise<[number, number]> {
    const text = await this.page
      .getByRole('heading', { name: 'Solving Steps' })
      .locator('xpath=..')
      .getByText(/^\d+\/\d+$/)
      .innerText()
    const [position = 0, total = 0] = text.split('/').map(Number)
    return [position, total]
  }
}

export interface Scenario {
  readonly name: string
  readonly storage: readonly (readonly [string, string])[]
  readonly path?: string
  /** Generates a puzzle in the worker, so it runs only once both builds take a seed. */
  readonly generates?: boolean
  readonly run: (d: Driver) => Promise<void>
}

/** Modes and states of the UI, each captured under a name for every check to compare. */
export const SCENARIOS: readonly Scenario[] = [
  {
    name: 'selection',
    storage: [POOL],
    run: async (d) => {
      await d.capture('selection')
      await d.click(d.button('Easy'))
      await d.capture('playing easy')
      for (const level of ['Medium', 'Hard', 'Expert', 'Extreme']) {
        await d.menu('New Puzzle', level)
        await d.capture(`playing ${level.toLowerCase()}`)
      }
      await d.click(d.button('New Puzzle'))
      await d.capture('new puzzle menu')
      await d.click(d.page.getByRole('menuitem', { name: 'Custom', exact: true }))
      await d.capture('custom empty')
      await d.paste(R1C1, PUZZLE)
      await d.capture('custom filled')
      await d.click(d.button('Start Puzzle'))
      await d.capture('custom started')
    },
  },
  {
    name: 'first visit',
    storage: [],
    generates: true,
    run: async (d) => {
      await d.click(d.button('Easy'))
      await d.capture('first visit generated')
    },
  },
  {
    name: 'create your own',
    storage: [POOL],
    run: async (d) => {
      await d.click(d.button('Create Your Own'))
      await d.capture('custom from selection')
      await d.paste(R1C1, 'not a sudoku')
      await d.capture('custom bad paste')
      await d.paste(R1C1, AMBIGUOUS)
      await d.click(d.button('Start Puzzle'))
      await d.capture('custom refused')
    },
  },
  {
    name: 'play',
    storage: [POOL, game(savedGame()), metrics(65, 0)],
    run: async (d) => {
      await d.capture('play start')
      await d.type(R1C3, '4')
      await d.capture('play entry')
      await d.click(d.cell(R1C1))
      await d.capture('play highlight')
      await d.type(R1C6, '5')
      await d.capture('play conflict')
      await d.click(d.button('Hint'))
      await d.capture('hint mistake')
      await d.click(d.button('Erase selected cell'))
      await d.click(d.button('Hint'))
      await d.capture('hint step')
      await d.click(d.button('Dismiss hint'))
      await d.mode('Corner')
      await d.type(R1C4, '2', '6')
      await d.capture('notes corner')
      await d.mode('Center')
      await d.type(R1C7, '1', '9')
      await d.capture('notes center')
      await d.mode('Pen')
      await d.click(d.button('Undo'))
      await d.capture('undo')
      await d.click(d.button('Redo'))
      await d.click(d.button('Share puzzle'))
      await d.capture('share menu')
      await d.click(d.page.getByRole('menuitem', { name: 'Copy puzzle link' }))
      await d.capture('share link copied')
      await d.menu('Share puzzle', 'Copy board as text')
      await d.capture('share text copied')
      await d.menu('New Puzzle', 'Easy')
      await d.capture('confirm abandon')
      await d.click(d.button('Cancel'))
      await d.click(d.button('Pause game'))
      await d.capture('paused')
      await d.click(d.button('Resume'))
      await d.click(d.button('Solve'))
      await d.capture('confirm solve')
      await d.click(d.button('Reveal solution'))
      await d.capture('walkthrough solution')
      const [, total] = await d.counter()
      await d.click(d.button('Initial Board State', false))
      await d.capture('walkthrough start')
      for (let step = 0; step < Math.floor(total / 2); step++) await d.click(d.button('Next step'))
      await d.capture('walkthrough middle')
      await d.click(d.button('Exit Visualization'))
      await d.capture('walkthrough exit')
      await d.click(d.button('Clear Board'))
      await d.capture('cleared')
    },
  },
  {
    name: 'sticky',
    storage: [POOL, game(savedGame())],
    run: async (d) => {
      await d.click(d.button('Sticky numbers'))
      await d.click(d.pad(4))
      await d.capture('sticky lock')
      await d.click(d.cell(R1C3))
      await d.capture('sticky placed')
    },
  },
  {
    name: 'win',
    storage: [POOL, game(savedGame({ board: solvedExcept(R9C7) })), metrics(75, 1)],
    run: async (d) => {
      await d.type(R9C7, '1')
      await d.capture('win')
      await d.click(d.page.getByRole('dialog').getByRole('button', { name: 'Easy', exact: true }))
      await d.capture('win next')
    },
  },
  {
    name: 'shared link',
    storage: [POOL],
    path: `/?p=${PUZZLE}`,
    run: async (d) => {
      await d.capture('link offer')
      await d.click(d.button('Start puzzle'))
      await d.capture('link accepted')
    },
  },
  {
    name: 'shared link in play',
    storage: [POOL, game(savedGame())],
    path: `/?p=${PUZZLE}&ref=parity#board`,
    run: async (d) => {
      await d.capture('link offer in play')
      await d.click(d.button('Not now'))
      await d.capture('link declined')
      await d.paste(R1C3, PUZZLE)
      await d.capture('paste offer in play')
    },
  },
  {
    name: 'malformed link',
    storage: [POOL],
    path: '/?p=12345',
    run: async (d) => {
      await d.capture('link malformed')
    },
  },
  {
    name: 'legacy save',
    storage: [POOL, game(legacyGame())],
    run: async (d) => {
      await d.capture('legacy loaded')
      await d.click(d.button('Undo'))
      await d.capture('legacy undone')
    },
  },
  {
    name: 'selection save',
    storage: [POOL, game(selectionScreenSave())],
    run: async (d) => {
      await d.capture('selection save loaded')
    },
  },
  {
    name: 'corrupt save',
    storage: [POOL, game('{"version":2,"history":'), metrics(30, 2)],
    run: async (d) => {
      await d.capture('corrupt save loaded')
    },
  },
]
