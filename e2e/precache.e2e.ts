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

import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { Page } from '@playwright/test'
import { type Plugin, preview, type PreviewServer } from 'vite'

import { parseUnicodeRange } from '../src/sw/precache-manifest'
import { expect, test } from './fixtures'

let server: PreviewServer | undefined
let served: string[] = []

/** Records the path of each response sent, so one the HTTP cache answered never shows. */
const recordResponses = (): Plugin => ({
  name: 'e2e:record-responses',
  configurePreviewServer({ middlewares }) {
    middlewares.use((req, res, next) => {
      res.on('finish', () => served.push(new URL(req.url ?? '/', 'http://preview').pathname))
      next()
    })
  },
})

async function serve(outDir: string): Promise<string> {
  server = await preview({
    build: { outDir },
    preview: { port: 0 },
    logLevel: 'silent',
    plugins: [recordResponses()],
  })
  const [url] = server.resolvedUrls?.local ?? []
  return url
}

// Its server log shows each of three fetches of one file in sequence.
test.skip(({ browserName }) => browserName === 'webkit', "Playwright's WebKit reuses no HTTP cache")

test.beforeEach(() => {
  served = []
})

test.afterEach(async () => {
  await server?.close()
  server = undefined
})

const assetsIn = (site: string) => readdirSync(path.join(site, 'assets')).map((f) => `/assets/${f}`)
const precachedIn = (site: string): string[] => {
  const manifest = /"hashed":(\[[^\]]*\])/.exec(readFileSync(path.join(site, 'sw.js'), 'utf8'))
  return (JSON.parse(manifest?.[1] ?? '[]') as string[]).map((url) => `/${url}`)
}

const PRINTABLE_ASCII = [0x20, 0x7e] as const

/** Fonts whose unicode-range misses all of ASCII, the only script the UI writes in. */
function fontsForOtherScripts(site: string): string[] {
  const styles = assetsIn(site).filter((file) => file.endsWith('.css'))
  const faces = styles.flatMap((file) =>
    [...readFileSync(path.join(site, file), 'utf8').matchAll(/@font-face\{([^}]*)\}/g)].map(
      ([, face]) => face,
    ),
  )
  return faces
    .filter((face) => {
      const range = /unicode-range:([^;}]+)/.exec(face)?.[1]
      const [low, high] = PRINTABLE_ASCII
      return (
        range !== undefined &&
        parseUnicodeRange(range).every(([first, last]) => last < low || first > high)
      )
    })
    .map((face) => /url\(([^)]+)\)/.exec(face)?.[1] as string)
}

const timesServed = (file: string) => served.filter((entry) => entry === file).length

test('a first visit downloads each hashed file once and no font the page cannot use', async ({
  page,
  open,
}) => {
  await open({ path: await serve('dist') })
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  const precached = precachedIn('dist')
  expect(precached.length).toBeGreaterThan(0)
  for (const file of fontsForOtherScripts('dist')) expect(timesServed(file), file).toBe(0)
  for (const file of precached) expect(timesServed(file), file).toBe(1)
  for (const file of assetsIn('dist').filter((f) => !precached.includes(f))) {
    expect(timesServed(file), file).toBe(0)
  }
})

const noop = () => Promise.resolve()

/** Deploys a next build that changes only the stylesheet, and returns its new path. */
function deployNextStylesheet(site: string): string {
  const before = precachedIn(site).find((file) => file.endsWith('.css')) as string
  const after = '/assets/index-next.css'
  renameSync(path.join(site, before), path.join(site, after))
  for (const file of ['index.html', 'sw.js']) {
    const target = path.join(site, file)
    const next = readFileSync(target, 'utf8')
      .replaceAll(before.slice(1), after.slice(1))
      .replace(/"version":"[0-9a-f]+"/, '"version":"next"')
    writeFileSync(target, next)
  }
  return after
}

async function expectUpdateFetchesOnlyTheChange(page: Page, site: string, beforeReload = noop) {
  const unchanged = precachedIn(site).filter((file) => !file.endsWith('.css'))
  const changed = deployNextStylesheet(site)
  await beforeReload()
  served = []

  await page.reload()
  await expect(page.getByText('Update available')).toBeVisible()

  expect(timesServed(changed)).toBe(1)
  for (const file of unchanged) expect(timesServed(file), file).toBe(0)
}

test.describe('an update', () => {
  let site = ''

  test.beforeEach(() => {
    site = mkdtempSync(path.join(tmpdir(), 'wasudoku-update-'))
    cpSync('dist', site, { recursive: true })
  })

  test.afterEach(() => {
    rmSync(site, { recursive: true, force: true })
  })

  test('downloads only the files the new build changed', async ({ page, open }) => {
    await open({ path: await serve(site) })
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

    await expectUpdateFetchesOnlyTheChange(page, site)
  })

  test('copies unchanged files from the earlier version once the HTTP cache lost them', async ({
    page,
    open,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Only Chromium lets a test clear its HTTP cache')
    await open({ path: await serve(site) })
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

    const session = await page.context().newCDPSession(page)
    await expectUpdateFetchesOnlyTheChange(page, site, async () => {
      await session.send('Network.clearBrowserCache')
    })
  })
})
