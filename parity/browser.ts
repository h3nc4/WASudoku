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

import type { Browser, BrowserContext, Page } from 'playwright'

import { readPageState, readStorage } from './page-state.ts'
import type { Site } from './serve.ts'

export const THEME_KEY = 'wasudoku-ui-theme'
export type Theme = 'light' | 'dark'

/** The viewport scripted steps run at. Screenshots then walk every width in WIDTHS. */
export const DRIVE = { width: 1350, height: 900 } as const

/** Screenshot widths, each with the height of a common device or window of that width. */
export const WIDTHS = [
  { width: 360, height: 780 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1350, height: 900 },
  { width: 1920, height: 1080 },
] as const

/** A fixed start for the fake clock, so the timer and the saved metrics agree across builds. */
const CLOCK_START = new Date('2026-01-01T00:00:00Z')
const PINNED_RANDOM = 0.5
const SEEDED_FLAG = 'wasudoku.parity.seeded'
const STEP_TIMEOUT_MS = 8000
/** What a build logs when the harness blocks its service worker, which only the PWA check allows. */
const BLOCKED_WORKER =
  /Service Worker registration blocked by Playwright|Service worker registration failed/

export interface OpenOptions {
  readonly storage?: readonly (readonly [string, string])[]
  readonly path?: string
  readonly theme?: Theme
  /** The clock stands still unless a step runs it, which only the service worker check turns off. */
  readonly fakeClock?: boolean
  readonly serviceWorkers?: boolean
  readonly viewport?: { readonly width: number; readonly height: number }
  /** Runs on the context before the page loads, and its answer is kept in Session.prepared. */
  readonly beforeLoad?: (context: BrowserContext) => Promise<boolean>
}

export interface Session {
  readonly site: Site
  readonly context: BrowserContext
  readonly page: Page
  readonly errors: string[]
  readonly fakeClock: boolean
  readonly prepared: boolean
}

/** A fresh context on one build, its storage seeded once per tab and every outside request refused. */
export async function openSession(
  browser: Browser,
  site: Site,
  options: OpenOptions = {},
): Promise<Session> {
  const { storage = [], path = '/', theme = 'dark', fakeClock = true } = options
  const context = await browser.newContext({
    viewport: { ...(options.viewport ?? DRIVE) },
    deviceScaleFactor: 1,
    colorScheme: theme,
    reducedMotion: 'reduce',
    serviceWorkers: options.serviceWorkers ? 'allow' : 'block',
  })
  context.setDefaultTimeout(STEP_TIMEOUT_MS)
  await context.route('**/*', (route) =>
    route.request().url().startsWith(site.origin) ? route.continue() : route.abort(),
  )
  await context.addInitScript((value) => {
    Math.random = () => value
  }, PINNED_RANDOM)
  await context.addInitScript(() => {
    const names = [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
    ]
    // Runs before the fake clock installs, so these are the real timers.
    let other: unknown[] = names.map((name) => Reflect.get(globalThis, name))
    Reflect.set(globalThis, '__paritySwapTimers', () => {
      const current = names.map((name) => Reflect.get(globalThis, name))
      names.forEach((name, i) => Reflect.set(globalThis, name, other[i]))
      other = current
    })
  })
  await context.addInitScript(() => {
    const copied: string[] = []
    Reflect.set(globalThis, '__parityClipboard', copied)
    const writeText = (text: string) => {
      copied.push(text)
      return Promise.resolve()
    }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  })
  const items: (readonly [string, string])[] = [[THEME_KEY, theme], ...storage]
  await context.addInitScript(
    ({ flag, entries }) => {
      if (sessionStorage.getItem(flag)) return
      sessionStorage.setItem(flag, '1')
      for (const [key, value] of entries) localStorage.setItem(key, value)
    },
    { flag: SEEDED_FLAG, entries: items },
  )
  const prepared = options.beforeLoad ? await options.beforeLoad(context) : true
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    const harmless = !options.serviceWorkers && BLOCKED_WORKER.test(m.text())
    if ((m.type() === 'error' || m.type() === 'warning') && !harmless) errors.push(m.text())
  })
  if (fakeClock) {
    await page.clock.install({ time: CLOCK_START })
    await page.clock.pauseAt(CLOCK_START)
  }
  await page.goto(site.origin + path)
  const session = { site, context, page, errors, fakeClock, prepared }
  await settle(session)
  return session
}

const QUIET_MS = 150
const POLL_MS = 50
const SETTLE_LIMIT_MS = 6000
/** Fake time each step runs, past the idle delay after which the app writes its save. */
const STEP_CLOCK_MS = 2000

/** Waits in real time until the page stops changing, which covers replies from the solver worker. */
async function quiet(page: Page) {
  const read = () => page.evaluate(readPageState)
  let last = await read()
  let still = 0
  for (let waited = 0; waited < SETTLE_LIMIT_MS && still < QUIET_MS; waited += POLL_MS) {
    await page.waitForTimeout(POLL_MS)
    const next = await read()
    still = next === last ? still + POLL_MS : 0
    last = next
  }
}

/** Lets a step finish. The fake clock always advances by the same amount, so timers agree. */
export async function settle({ page, fakeClock }: Session) {
  await quiet(page)
  if (!fakeClock) return
  await page.clock.runFor(STEP_CLOCK_MS)
  await quiet(page)
}

export const pageState = (page: Page) => page.evaluate(readPageState)
export const pageStorage = (page: Page) => page.evaluate(readStorage)

/** Storage as entries, to seed another build with exactly what this one saved. */
export const storageEntries = (page: Page): Promise<[string, string][]> =>
  page.evaluate(() =>
    Object.keys(localStorage).map((key): [string, string] => [
      key,
      localStorage.getItem(key) ?? '',
    ]),
  )
