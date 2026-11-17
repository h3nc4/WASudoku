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

import type { Locator, Page } from '@playwright/test'

import {
  cell,
  cellName,
  digitOf,
  expect,
  expectAccessible,
  padKey,
  PUZZLE,
  savedGame,
  test,
} from './fixtures'

const shortcuts = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' })
const stickyToggle = (page: Page) => page.getByRole('button', { name: 'Sticky numbers' })
const mode = (page: Page, name: string) => page.getByRole('radio', { name })
const step = (page: Page) => page.locator('[aria-current="step"]')

// R1C3 and R1C4 are empty in PUZZLE, R5C5 is the centre, and arrows move from it by one.
const R1C3 = 2
const R1C4 = 3
const R5C5 = 40
const ROW = 9

/** The engines here run on Linux, where Safari's user agent still reads as a Mac. */
const appleAgent = (page: Page) =>
  page.evaluate(() => /Mac|iPhone|iPad|iPod/u.test(navigator.userAgent))

/** One row of the list as the dialog shows it, each chord as its caps. */
interface Row {
  readonly action: string
  readonly chords: readonly (readonly string[])[]
}

async function listed(page: Page, section: string): Promise<Row[]> {
  const table = shortcuts(page)
    .locator('table')
    .filter({ has: page.locator('caption', { hasText: section }) })
  return table.locator('tbody tr').evaluateAll((rows) =>
    rows.map((row) => ({
      action: row.querySelector('td')?.textContent ?? '',
      chords: [...row.querySelectorAll('th > kbd')].map((chord) =>
        [...chord.querySelectorAll('kbd')].map((cap) => cap.textContent),
      ),
    })),
  )
}

const KEYS: Readonly<Record<string, string>> = {
  '↑': 'ArrowUp',
  '↓': 'ArrowDown',
  '←': 'ArrowLeft',
  '→': 'ArrowRight',
  Esc: 'Escape',
  Ctrl: 'Control',
  Cmd: 'Meta',
}
const DIGIT_RANGE = /^(\d)–(\d)$/u

/** The presses a chord stands for, one per digit of a range, as Playwright spells them. */
function pressesOf(chord: readonly string[]): string[] {
  const range = chord.length === 1 ? DIGIT_RANGE.exec(chord[0] ?? '') : null
  if (range) {
    const [from, to] = [Number(range[1]), Number(range[2])]
    return Array.from({ length: to - from + 1 }, (_, k) => String(from + k))
  }
  const shifted = chord.includes('Shift')
  const keys = chord.map(
    (cap) => KEYS[cap] ?? (cap.length === 1 && !shifted ? cap.toLowerCase() : cap),
  )
  return [keys.join('+')]
}

/** What a listed action promises, checked from any state the other checks leave behind. */
type Check = (page: Page, press: string) => Promise<void>

/** Clears a cell, then types a digit into it in the current mode. */
async function enter(page: Page, index: number, digit: string) {
  await cell(page, index).focus()
  await page.keyboard.press('Delete')
  await page.keyboard.press(digit)
}

async function inMode(page: Page, name: string, act: () => Promise<void>) {
  await mode(page, name).click()
  await act()
  await mode(page, 'Pen').click()
}

const BOX = 3
/** Each note mode and the words a cell's name reads its notes with. */
const NOTES = [
  ['Corner', 'candidates'],
  ['Center', 'center notes'],
] as const

/** The first empty cell of PUZZLE whose row, column and box lack `digit`, so a note of it is taken. */
function openTo(digit: number): number {
  const holds = (index: number) => PUZZLE[index] === String(digit)
  const peers = (index: number) => {
    const [row, col] = [Math.floor(index / ROW), index % ROW]
    const [top, left] = [row - (row % BOX), col - (col % BOX)]
    return Array.from({ length: ROW * ROW }, (_, k) => k).filter((k) => {
      const [r, c] = [Math.floor(k / ROW), k % ROW]
      const sameBox = r - (r % BOX) === top && c - (c % BOX) === left
      return r === row || c === col || sameBox
    })
  }
  const found = [...PUZZLE].findIndex((char, i) => char === '0' && !peers(i).some(holds))
  if (found < 0) throw new Error(`No empty cell takes a note of ${String(digit)}`)
  return found
}

const MOVES: Readonly<Record<string, number>> = {
  ArrowUp: -ROW,
  ArrowDown: ROW,
  ArrowLeft: -1,
  ArrowRight: 1,
}

const ON_A_CELL: Readonly<Record<string, Check>> = {
  'Enter the digit, or toggle its note in Corner or Center': async (page, press) => {
    await enter(page, R1C3, press)
    await expect(digitOf(page, R1C3)).toHaveText(press)
    await page.keyboard.press('Delete')
    const free = openTo(Number(press))
    for (const [name, notes] of NOTES) {
      await inMode(page, name, async () => {
        await cell(page, free).focus()
        await page.keyboard.press(press)
        await expect(cell(page, free)).toHaveAttribute(
          'aria-label',
          `${cellName(free)}, empty, ${notes} ${press}`,
        )
        await page.keyboard.press(press)
        await expect(cell(page, free)).toHaveAttribute('aria-label', `${cellName(free)}, empty`)
      })
    }
  },
  'Erase the selected cell': async (page, press) => {
    await enter(page, R1C3, '4')
    await expect(digitOf(page, R1C3)).toHaveText('4')
    await page.keyboard.press(press)
    await expect(digitOf(page, R1C3)).toHaveCount(0)
    await expect(cell(page, R1C3)).toBeFocused()
  },
  'Erase the selected cell and move to the previous one': async (page, press) => {
    await enter(page, R1C4, '6')
    await expect(digitOf(page, R1C4)).toHaveText('6')
    await page.keyboard.press(press)
    await expect(digitOf(page, R1C4)).toHaveCount(0)
    await expect(cell(page, R1C3)).toBeFocused()
  },
  'Move the selection': async (page, press) => {
    await cell(page, R5C5).focus()
    await page.keyboard.press(press)
    await expect(cell(page, R5C5 + (MOVES[press] ?? 0))).toBeFocused()
  },
  'Cycle through Pen, Corner and Center': async (page, press) => {
    await cell(page, R1C3).focus()
    for (const name of ['Corner', 'Center', 'Pen']) {
      await page.keyboard.press(press)
      await expect(mode(page, name)).toBeChecked()
    }
  },
}

/** Puts text on the clipboard through the engine's own copy, the chord a paste of it pairs with. */
async function copy(page: Page, text: string, press: string) {
  const area = page.locator('#clip')
  await page.evaluate((value) => {
    const field = document.createElement('textarea')
    field.id = 'clip'
    field.value = value
    document.body.append(field)
  }, text)
  await area.selectText()
  await page.keyboard.press(press.replace(/v$/u, 'c'))
  await area.evaluate((field) => {
    field.remove()
  })
}

const ANYWHERE: Readonly<Record<string, Check>> = {
  Undo: async (page, press) => {
    await enter(page, R1C3, '4')
    await expect(digitOf(page, R1C3)).toHaveText('4')
    await page.keyboard.press(press)
    await expect(digitOf(page, R1C3)).toHaveCount(0)
  },
  Redo: async (page, press) => {
    await enter(page, R1C3, '4')
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(digitOf(page, R1C3)).toHaveCount(0)
    await page.keyboard.press(press)
    await expect(digitOf(page, R1C3)).toHaveText('4')
    await cell(page, R1C3).focus()
    await page.keyboard.press('Delete')
  },
  'Paste a puzzle string onto the board': async (page, press) => {
    // Paste is the engine's own, so it takes the host's chord. A Mac user agent on Linux says Cmd.
    const native = press.replace(/^Meta\+/u, 'ControlOrMeta+')
    await copy(page, PUZZLE, native)
    await cell(page, R1C3).focus()
    await page.keyboard.press(native)
    const offer = page.getByRole('alertdialog', { name: 'Start this puzzle?' })
    await expect(offer).toBeVisible()
    await offer.getByRole('button', { name: 'Not now' }).click()
    await expect(offer).toBeHidden()
  },
  'Turn sticky numbers on or off': async (page, press) => {
    const before = await stickyToggle(page).getAttribute('aria-pressed')
    const after = before === 'true' ? 'false' : 'true'
    await cell(page, R1C3).focus()
    await page.keyboard.press(press)
    await expect(stickyToggle(page)).toHaveAttribute('aria-pressed', after)
    await page.keyboard.press(press)
    await expect(stickyToggle(page)).toHaveAttribute('aria-pressed', before ?? 'false')
  },
  'Release the locked sticky digit': async (page, press) => {
    await stickyToggle(page).click()
    await padKey(page, 4).click()
    await expect(padKey(page, 4)).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press(press)
    await expect(padKey(page, 4)).toHaveAttribute('aria-pressed', 'false')
    await stickyToggle(page).click()
    await expect(stickyToggle(page)).toHaveAttribute('aria-pressed', 'false')
  },
}

/** Steps the walkthrough to its second step, from which either arrow has a step to go to. */
async function atSecondStep(page: Page) {
  await page.locator('#step-start').click()
  await page.locator('#next-step').click()
  await page.locator('#next-step').click()
  await expect(step(page)).toHaveAttribute('data-step', '2')
}

const IN_THE_WALKTHROUGH: Readonly<Record<string, Check>> = {
  'Previous solving step': async (page, press) => {
    await atSecondStep(page)
    await page.keyboard.press(press)
    await expect(step(page)).toHaveAttribute('data-step', '1')
  },
  'Next solving step': async (page, press) => {
    await atSecondStep(page)
    await page.keyboard.press(press)
    await expect(step(page)).toHaveAttribute('data-step', '3')
  },
}

/** Reads a section off the dialog, then runs its check for every chord the list shows. */
async function everyKeyIn(page: Page, section: string, checks: Readonly<Record<string, Check>>) {
  await page.keyboard.press('Shift+?')
  const rows = await listed(page, section)
  await page.keyboard.press('Escape')
  await expect(shortcuts(page)).toBeHidden()
  // A row without a check, or a check whose row is gone, fails here rather than passing unread.
  expect(rows.map((row) => row.action).toSorted()).toEqual(Object.keys(checks).toSorted())
  for (const { action, chords } of rows) {
    for (const press of chords.flatMap(pressesOf)) {
      await test.step(`${press}: ${action}`, () => checks[action]?.(page, press))
    }
  }
}

async function revealSolution(page: Page) {
  await page.locator('#solve-button').click()
  const dialog = page.getByRole('alertdialog', { name: 'Reveal the solution?' })
  await dialog.getByRole('button', { name: 'Reveal solution' }).click()
  await expect(page.locator('#steps-panel')).toBeVisible()
}

async function expectModifier(page: Page, dialog: Locator) {
  const modifier = (await appleAgent(page)) ? 'Cmd' : 'Ctrl'
  await expect(
    dialog.getByRole('rowheader', { name: new RegExp(`^${modifier}\\s*\\+\\s*Z$`) }),
  ).toBeVisible()
  await expect(dialog.locator('kbd[data-modifier]').first()).toHaveText(modifier)
}

test('? opens the shortcuts list from the board, and Esc hands focus back', async ({
  page,
  open,
}) => {
  await open({ game: savedGame() })
  await cell(page, 0).focus()
  await page.keyboard.press('Shift+?')
  const dialog = shortcuts(page)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused()
  await expect(dialog).toHaveAccessibleDescription(
    'Press ? to open this list from anywhere but a text field.',
  )
  await expectModifier(page, dialog)
  await expectAccessible(page, 'the shortcuts dialog')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(cell(page, 0)).toBeFocused()
})

test('the header button opens the shortcuts list, and Close hands focus back', async ({
  page,
  open,
}) => {
  await open({ game: savedGame() })
  const button = page.getByRole('button', { name: 'Keyboard shortcuts' })
  // Safari doesn't focus a clicked button. The keyboard press gives focus return a button to go to.
  await button.focus()
  await page.keyboard.press('Enter')
  const dialog = shortcuts(page)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Close' }).press('Enter')
  await expect(dialog).toBeHidden()
  await expect(button).toBeFocused()
})

test('every key listed for a selected cell does what the list says', async ({ page, open }) => {
  await open({ game: savedGame() })
  await everyKeyIn(page, 'On a selected cell', ON_A_CELL)
})

test('every key listed for anywhere does what the list says', async ({ page, open }) => {
  await open({ game: savedGame() })
  await everyKeyIn(page, 'Anywhere', ANYWHERE)
})

test('every key listed for the solving steps does what the list says', async ({ page, open }) => {
  await open({ game: savedGame() })
  await revealSolution(page)
  await everyKeyIn(page, 'While viewing the solving steps', IN_THE_WALKTHROUGH)
})
