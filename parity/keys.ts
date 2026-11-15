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

import type { Browser } from 'playwright'

import { savedGame, STORAGE_KEYS } from '../e2e/saves.ts'
import { openSession, pageState, pageStorage, settle } from './browser.ts'
import type { KeySource } from './keymap.ts'
import { firstDifference, report } from './report.ts'
import { Driver, POOL } from './scenarios.ts'
import type { Site } from './serve.ts'

/** Modifier sets each key is pressed with, covering the shortcut chords and their near misses. */
const MODIFIERS = ['', 'Shift+', 'Control+', 'Meta+', 'Alt+', 'Control+Shift+'] as const
/** Real time for a key's effects to land before the state is read. */
const KEY_SETTLE_MS = 40
const R1C3 = 2

/** Playwright names the space bar Space, and a literal space would read as a missing key. */
const pressable = (key: string) => (key === ' ' ? 'Space' : key)

interface KeyContext {
  readonly name: string
  readonly storage: readonly (readonly [string, string])[]
  readonly enter: (d: Driver) => Promise<void>
}

const PLAYING = [POOL, [STORAGE_KEYS.GAME, savedGame()]] as const

/** Each mode a key can act in, and the ones where it must not. */
const CONTEXTS: readonly KeyContext[] = [
  { name: 'pen', storage: PLAYING, enter: (d) => d.click(d.cell(R1C3)) },
  {
    name: 'corner',
    storage: PLAYING,
    enter: async (d) => {
      await d.mode('Corner')
      await d.click(d.cell(R1C3))
    },
  },
  {
    name: 'center',
    storage: PLAYING,
    enter: async (d) => {
      await d.mode('Center')
      await d.click(d.cell(R1C3))
    },
  },
  {
    name: 'sticky',
    storage: PLAYING,
    enter: async (d) => {
      await d.click(d.button('Sticky numbers'))
      await d.click(d.pad(4))
      await d.click(d.cell(R1C3))
    },
  },
  { name: 'no selection', storage: PLAYING, enter: () => Promise.resolve() },
  {
    name: 'custom entry',
    storage: [POOL],
    enter: async (d) => {
      await d.click(d.button('Create Your Own'))
      await d.click(d.cell(0))
    },
  },
  {
    name: 'walkthrough',
    storage: PLAYING,
    enter: async (d) => {
      await d.click(d.button('Solve'))
      await d.click(d.button('Reveal solution'))
      await d.click(d.button('Initial Board State', false))
    },
  },
  {
    name: 'dialog open',
    storage: PLAYING,
    enter: async (d) => {
      await d.click(d.cell(R1C3))
      await d.click(d.button('Solve'))
    },
  },
  {
    name: 'paused',
    storage: PLAYING,
    enter: (d) => d.click(d.button('Pause game')),
  },
]

/** Presses every key with every modifier set, in order, and records the state after each. */
async function walk(
  browser: Browser,
  site: Site,
  context: KeyContext,
  modifier: string,
  keys: readonly string[],
) {
  const session = await openSession(browser, site, { storage: context.storage })
  const steps: string[] = []
  try {
    await context.enter(new Driver(session, () => Promise.resolve()))
    for (const key of keys) {
      await session.page.keyboard.press(`${modifier}${pressable(key)}`)
      await session.page.waitForTimeout(KEY_SETTLE_MS)
      steps.push(`after ${modifier}${pressable(key)}\n${await pageState(session.page)}`)
    }
    await settle(session)
    steps.push(`storage\n${await pageStorage(session.page)}`)
  } catch (e) {
    steps.push(`error ${String(e).split('\n')[0] ?? ''}`)
  }
  await session.context.close()
  return steps
}

/** Presses the keymap on both builds and wants the same state after every key, in every mode. */
export async function checkKeys(
  browser: Browser,
  sites: { readonly ref: Site; readonly candidate: Site },
  source: KeySource,
) {
  report(
    'keymap source',
    source.keys.length > 0,
    `${source.keys.length} keys from ${source.from}: ${source.keys.map(pressable).join(' ')}`,
  )
  for (const context of CONTEXTS) {
    for (const modifier of MODIFIERS) {
      const name = `keys ${context.name} ${modifier || 'plain '}`.trim()
      const [ref, candidate] = await Promise.all([
        walk(browser, sites.ref, context, modifier, source.keys),
        walk(browser, sites.candidate, context, modifier, source.keys),
      ])
      const at = ref.findIndex((step, i) => step !== candidate[i])
      const refError = ref.find((step) => step.startsWith('error'))
      if (refError) report(`${name} on the reference`, false, refError)
      report(
        name,
        at === -1 && ref.length === candidate.length,
        at === -1
          ? `${ref.length} states equal`
          : `${(ref[at] ?? '').split('\n')[0] ?? ''}: ${firstDifference(ref[at] ?? '', candidate[at] ?? '')}`,
      )
    }
  }
}
