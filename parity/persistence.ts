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

import { openSession, pageState, pageStorage, storageEntries } from './browser.ts'
import { differences, report } from './report.ts'
import { Driver, type Scenario, SCENARIOS } from './scenarios.ts'
import type { Site } from './serve.ts'

/** Scenarios whose final save is handed to the other build, covering play, entry and old formats. */
const HANDED_OVER = ['play', 'selection', 'create your own', 'legacy save', 'corrupt save', 'win']

/** Plays a scenario to its end and returns what the build left in storage. */
async function saveOf(browser: Browser, site: Site, scenario: Scenario) {
  const session = await openSession(browser, site, {
    storage: scenario.storage,
    ...(scenario.path ? { path: scenario.path } : {}),
  })
  await scenario.run(new Driver(session, () => Promise.resolve())).catch(() => undefined)
  const entries = await storageEntries(session.page)
  await session.context.close()
  return entries
}

/** Opens a build on a save and reads what it shows and what it writes back. */
async function load(browser: Browser, site: Site, storage: readonly (readonly [string, string])[]) {
  const session = await openSession(browser, site, { storage })
  const seen = `${await pageState(session.page)}\n${await pageStorage(session.page)}`
  await session.context.close()
  return seen
}

/** Each build opens the other's save exactly as it opens its own. */
export async function checkCrossLoad(
  browser: Browser,
  sites: { readonly ref: Site; readonly candidate: Site },
) {
  for (const scenario of SCENARIOS.filter((s) => HANDED_OVER.includes(s.name))) {
    const saves = await Promise.all([
      saveOf(browser, sites.ref, scenario),
      saveOf(browser, sites.candidate, scenario),
    ])
    for (const [writer, save] of [
      ['reference', saves[0]],
      ['candidate', saves[1]],
    ] as const) {
      const [byRef, byCandidate] = await Promise.all([
        load(browser, sites.ref, save),
        load(browser, sites.candidate, save),
      ])
      report(
        `cross-load ${scenario.name}, ${writer} save`,
        byRef === byCandidate,
        byRef === byCandidate
          ? `both builds show and keep the same, ${save.length} keys`
          : differences(byRef, byCandidate),
      )
    }
  }
}
