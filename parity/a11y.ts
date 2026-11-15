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
import type { Page } from 'playwright'

/** The accessible tree as Playwright prints it, one node a line, the origin taken out. */
export async function accessibleTree(page: Page): Promise<string[]> {
  const origin = await page.evaluate(() => location.origin)
  const tree = await page.locator('body').ariaSnapshot()
  return tree
    .split('\n')
    .map((line) => line.replace(/^\s*-?\s*/, '').replaceAll(origin, '<origin>'))
    .filter(Boolean)
}

/** Violations per rule, as `rule impact` to the number of nodes it flags. */
export async function axeViolations(page: Page): Promise<Map<string, number>> {
  const run = () => new AxeBuilder({ page }).analyze()
  const { violations } = await withRealTimers(page, run)
  return new Map(violations.map((v) => [`${v.id} ${v.impact ?? 'unknown'}`, v.nodes.length]))
}

// Axe waits on timers, which the paused fake clock never fires. The page keeps the real ones from
// before the clock was installed, and they stand in only while axe runs.
async function withRealTimers<T>(page: Page, run: () => Promise<T>): Promise<T> {
  await page.evaluate(() => Reflect.get(globalThis, '__paritySwapTimers')?.())
  try {
    return await run()
  } finally {
    await page.evaluate(() => Reflect.get(globalThis, '__paritySwapTimers')?.())
  }
}

export interface Direction {
  /** What the reference has and the candidate lost, which fails. */
  readonly lost: string[]
  /** What the candidate gained or fixed, which is reported and passes. */
  readonly gained: string[]
}

/** Tree nodes as a multiset: the candidate must keep every node of the reference. */
export function compareTrees(ref: readonly string[], candidate: readonly string[]): Direction {
  const count = (lines: readonly string[]) => {
    const map = new Map<string, number>()
    for (const line of lines) map.set(line, (map.get(line) ?? 0) + 1)
    return map
  }
  const [a, b] = [count(ref), count(candidate)]
  const lost = [...a].flatMap(([line, n]) => ((b.get(line) ?? 0) < n ? [line] : []))
  const gained = [...b].flatMap(([line, n]) => ((a.get(line) ?? 0) < n ? [line] : []))
  return { lost, gained }
}

/** Axe counts per rule: more nodes or a new rule in the candidate is a regression, fewer a fix. */
export function compareAxe(ref: Map<string, number>, candidate: Map<string, number>): Direction {
  const rules = new Set([...ref.keys(), ...candidate.keys()])
  const lost: string[] = []
  const gained: string[] = []
  for (const rule of rules) {
    const [a, b] = [ref.get(rule) ?? 0, candidate.get(rule) ?? 0]
    if (b > a) lost.push(`${rule} ${a} to ${b}`)
    if (b < a) gained.push(`${rule} ${a} to ${b}`)
  }
  return { lost, gained }
}
