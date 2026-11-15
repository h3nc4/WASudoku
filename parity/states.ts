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

import type { Browser, Page } from 'playwright'

import { accessibleTree, axeViolations, compareAxe, compareTrees } from './a11y.ts'
import { DRIVE, openSession, pageState, pageStorage, type Theme, WIDTHS } from './browser.ts'
import { GENERATION_SEED, seedGeneration } from './determinism.ts'
import { diffPercent } from './pixels.ts'
import { firstDifference, note, report, writeOut } from './report.ts'
import { Driver, type Scenario, SCENARIOS } from './scenarios.ts'
import type { Site } from './serve.ts'

/** Share of pixels allowed to differ at one width, as a percent of the full page. */
export const PIXEL_TOLERANCE_PERCENT = 0.02
/** Real time for layout and resize observers to catch up after a viewport change. */
const RESIZE_SETTLE_MS = 250
const PREVIEW_LINES = 3
/** Keeps every reference frame in the output, to look at what the checks compared. */
const KEEP_FRAMES = Boolean(process.env.PARITY_KEEP)

/** The only regions masked in screenshots, each named, and each one truly varying between runs. */
export const MASKS: Readonly<Record<string, (page: Page) => ReturnType<Page['getByText']>>> = {
  timer: (page) => page.getByText(/^\d{2}:\d{2}$/),
}

interface Capture {
  readonly label: string
  readonly state: string
  readonly storage: string
  readonly shots: Buffer[]
  readonly heights: number[]
  readonly tree: string[]
  readonly axe: Map<string, number>
}

interface Run {
  readonly skipped?: boolean
  readonly captures: Capture[]
  readonly error: string | null
  readonly console: string[]
}

export interface StateOptions {
  readonly pixels: boolean
  readonly a11y: boolean
}

async function capture(page: Page, label: string, options: StateOptions): Promise<Capture> {
  const state = await pageState(page)
  const storage = await pageStorage(page)
  const tree = options.a11y ? await accessibleTree(page) : []
  const axe = options.a11y ? await axeViolations(page) : new Map<string, number>()
  const shots: Buffer[] = []
  const heights: number[] = []
  if (options.pixels) {
    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport)
      await page.waitForTimeout(RESIZE_SETTLE_MS)
      heights.push(await page.evaluate(() => document.documentElement.scrollHeight))
      shots.push(
        await page.screenshot({
          fullPage: true,
          animations: 'disabled',
          caret: 'hide',
          mask: Object.values(MASKS).map((mask) => mask(page)),
          maskColor: '#ff00ff',
        }),
      )
    }
    await page.setViewportSize(DRIVE)
    await page.waitForTimeout(RESIZE_SETTLE_MS)
  }
  return { label, state, storage, shots, heights, tree, axe }
}

async function runScenario(
  browser: Browser,
  site: Site,
  scenario: Scenario,
  theme: Theme,
  options: StateOptions,
): Promise<Run> {
  const captures: Capture[] = []
  const session = await openSession(browser, site, {
    storage: scenario.storage,
    theme,
    ...(scenario.path ? { path: scenario.path } : {}),
    ...(scenario.generates
      ? { beforeLoad: (context) => seedGeneration(context, GENERATION_SEED) }
      : {}),
  })
  if (!session.prepared) {
    await session.context.close()
    return { captures, error: null, console: [], skipped: true }
  }
  const driver = new Driver(session, async (label) => {
    captures.push(await capture(session.page, label, options))
  })
  let error: string | null = null
  try {
    await scenario.run(driver)
  } catch (e) {
    error = String(e).split('\n')[0] ?? 'error'
  }
  await session.context.close()
  return { captures, error, console: session.errors }
}

/** A console line without its origin, asset hashes and positions, which differ between builds. */
const normalise = (line: string) =>
  (line.split('\n')[0] ?? '')
    .replaceAll(/https?:\/\/[^/\s]+/g, '<origin>')
    .replaceAll(/[\w-]+-[\w-]{8}\.(js|css)/g, '<asset>')
    .replaceAll(/:\d+:\d+/g, '')

const preview = (lines: readonly string[]) =>
  lines.slice(0, PREVIEW_LINES).join(' | ') + (lines.length > PREVIEW_LINES ? ' ...' : '')

function compareCapture(name: string, ref: Capture, candidate: Capture, options: StateOptions) {
  report(
    `${name} state`,
    ref.state === candidate.state,
    ref.state === candidate.state ? 'equal' : firstDifference(ref.state, candidate.state),
  )
  report(
    `${name} storage`,
    ref.storage === candidate.storage,
    ref.storage === candidate.storage
      ? `equal, ${ref.storage.length} bytes`
      : firstDifference(ref.storage, candidate.storage),
  )
  if (options.pixels) {
    const percents = ref.shots.map((shot, i) => {
      const other = candidate.shots[i]
      const width = WIDTHS[i]?.width ?? 0
      if (KEEP_FRAMES) writeOut(`${name} ${width}-frame.png`, shot)
      return other ? diffPercent(shot, other, `${name} ${width}`) : Number.POSITIVE_INFINITY
    })
    const worst = Math.max(...percents)
    const at = WIDTHS[percents.indexOf(worst)]?.width ?? 0
    report(
      `${name} pixels`,
      worst <= PIXEL_TOLERANCE_PERCENT,
      `worst ${worst.toFixed(3)}% at ${at}px, ${PIXEL_TOLERANCE_PERCENT}% allowed`,
    )
    const heights = ref.heights.join(' ') === candidate.heights.join(' ')
    report(
      `${name} page heights`,
      heights,
      `ref ${ref.heights.join(' ')} candidate ${candidate.heights.join(' ')}`,
    )
  }
  if (options.a11y) {
    const tree = compareTrees(ref.tree, candidate.tree)
    report(
      `${name} accessible tree`,
      tree.lost.length === 0,
      tree.lost.length ? `lost ${preview(tree.lost)}` : `${ref.tree.length} nodes kept`,
    )
    if (tree.gained.length) note(`${name} accessible tree`, `gained ${preview(tree.gained)}`)
    const axe = compareAxe(ref.axe, candidate.axe)
    report(
      `${name} axe`,
      axe.lost.length === 0,
      axe.lost.length ? `worse ${axe.lost.join(', ')}` : `${ref.axe.size} rules flagged on both`,
    )
    if (axe.gained.length) note(`${name} axe`, `fixed ${axe.gained.join(', ')}`)
  }
}

/** Every scenario on both builds in both themes, compared capture by capture. */
export async function checkStates(
  browser: Browser,
  sites: { readonly ref: Site; readonly candidate: Site },
  options: StateOptions,
  only: readonly string[] = [],
) {
  for (const theme of ['dark', 'light'] as const) {
    for (const scenario of SCENARIOS) {
      if (only.length && !only.includes(scenario.name)) continue
      const [ref, candidate] = await Promise.all([
        runScenario(browser, sites.ref, scenario, theme, options),
        runScenario(browser, sites.candidate, scenario, theme, options),
      ])
      const name = `${theme} ${scenario.name}`
      if (ref.skipped || candidate.skipped) {
        note(name, 'skipped, it generates and no build takes a seed yet')
        continue
      }
      if (ref.error) report(`${name} runs on the reference`, false, ref.error)
      report(
        `${name} runs`,
        candidate.error === ref.error,
        candidate.error ?? `${candidate.captures.length} captures`,
      )
      ref.captures.forEach((captured, i) => {
        const other = candidate.captures[i]
        const label = `${theme} ${captured.label}`
        if (other?.label === captured.label) compareCapture(label, captured, other, options)
        else report(label, false, 'not reached on the candidate')
      })
      const known = new Set(ref.console.map(normalise))
      const added = candidate.console.map(normalise).filter((line) => !known.has(line))
      report(
        `${name} console`,
        added.length === 0,
        added.length ? `new ${added.join(' | ')}` : `nothing the reference does not log`,
      )
    }
  }
}
