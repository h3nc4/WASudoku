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

import { openSession, type Session } from './browser.ts'
import { report } from './report.ts'
import { Driver, POOL } from './scenarios.ts'
import type { Site } from './serve.ts'

const INSTALL_TIMEOUT_MS = 30_000
const NEXT_BUILD = 'next'
/** A file the build serves but leaves out of its precache, so it loads only from the network. */
const OUTSIDE_PRECACHE = '/wasudoku-preview.png'

/** Behaviour the reference must show, so a pass between two builds that both fail means nothing. */
const EXPECTED: Readonly<Record<string, string>> = {
  'service worker controls the page': 'true',
  'offline reload shows the selection screen': 'true',
  'offline new game has givens': 'true',
  'offline fetch outside the precache': 'failed',
  'reload after a deploy serves the new page': NEXT_BUILD,
  'update offered': 'true',
  'after the update the new page stays': NEXT_BUILD,
  'after the update the offer is gone': 'true',
}

const controlled = (page: Page) =>
  page
    .waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
      timeout: INSTALL_TIMEOUT_MS,
    })
    .then(
      () => 'true',
      () => 'false',
    )

const buildOf = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset['build'] ?? 'none')

/** A deploy of the same build with a marked page and a changed worker script. */
function deploy(site: Site) {
  const mark: (body: string) => string = (body) =>
    body.replace('<html', `<html data-build="${NEXT_BUILD}"`)
  site.rewrite('/', mark)
  site.rewrite('/index.html', mark)
  site.rewrite('/sw.js', (body) => `${body}\n// ${NEXT_BUILD}\n`)
}

async function observe(session: Session): Promise<Map<string, string>> {
  const { page, site } = session
  const seen = new Map<string, string>()
  const d = new Driver(session, () => Promise.resolve())
  try {
    seen.set('service worker controls the page', await controlled(page))
    site.down = true
    await page.reload()
    const welcome = page.getByRole('heading', { name: 'Welcome to WASudoku' })
    seen.set('offline reload shows the selection screen', String(await welcome.isVisible()))
    await d.click(d.button('Easy'))
    const board = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-label^="Sudoku cell at row"]')].some(
        (el) => el instanceof HTMLInputElement && el.value !== '',
      ),
    )
    seen.set('offline new game has givens', String(board))
    const outside = await page.evaluate(
      (path) =>
        fetch(path).then(
          () => 'loaded',
          () => 'failed',
        ),
      OUTSIDE_PRECACHE,
    )
    seen.set('offline fetch outside the precache', outside)
    site.down = false
    deploy(site)
    await page.reload()
    seen.set('reload after a deploy serves the new page', await buildOf(page))
    const offer = page.getByText('Update available')
    seen.set(
      'update offered',
      String(
        await offer.waitFor().then(
          () => true,
          () => false,
        ),
      ),
    )
    const reloaded = page.waitForEvent('load')
    await page.getByRole('button', { name: 'Reload', exact: true }).click()
    await reloaded
    seen.set('after the update the new page stays', await buildOf(page))
    seen.set('after the update the offer is gone', String(await offer.isHidden()))
  } catch (e) {
    seen.set('error', String(e).split('\n')[0] ?? '')
  } finally {
    site.down = false
    for (const path of ['/', '/index.html', '/sw.js']) site.rewrite(path, null)
  }
  return seen
}

/** Install, offline reload and the update offer, compared as what each build does and shows. */
export async function checkPwa(
  browser: Browser,
  sites: { readonly ref: Site; readonly candidate: Site },
) {
  const run = async (site: Site) => {
    const session = await openSession(browser, site, {
      storage: [POOL],
      fakeClock: false,
      serviceWorkers: true,
    })
    const seen = await observe(session)
    await session.context.close()
    return seen
  }
  const [ref, candidate] = await Promise.all([run(sites.ref), run(sites.candidate)])
  for (const [name, expected] of Object.entries(EXPECTED)) {
    const [a = 'missing', b = 'missing'] = [ref.get(name), candidate.get(name)]
    if (a !== expected) report(`pwa ${name} on the reference`, false, `${a}, expected ${expected}`)
    report(`pwa ${name}`, a === b, `ref ${a} candidate ${b}`)
  }
  for (const [name, seen] of [
    ['reference', ref],
    ['candidate', candidate],
  ] as const) {
    const error = seen.get('error')
    if (error) report(`pwa runs on the ${name}`, false, error)
  }
}
