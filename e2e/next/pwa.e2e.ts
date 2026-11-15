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

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { headersFor, parseHeaders } from '../../src/site/headers'
import { serveSite, type StaticSite } from './server'

const BUILD = 'dist-next'
const WELCOME = 'Welcome to WASudoku'

interface Violation {
  readonly directive: string
  readonly blocked: string
  readonly disposition: string
}

declare global {
  interface Window {
    cspViolations?: Violation[]
  }
}

let sites: string[] = []
let servers: StaticSite[] = []

/** A copy of the build, which a test may edit as a deploy would. */
function copyBuild() {
  const site = mkdtempSync(path.join(tmpdir(), 'wasudoku-next-'))
  cpSync(BUILD, site, { recursive: true })
  sites.push(site)
  return site
}

async function serve(site: string) {
  const server = await serveSite(site)
  servers.push(server)
  return server
}

test.beforeEach(async ({ page }) => {
  // Runs at document start, before the parser meets the first inline style.
  await page.addInitScript(() => {
    window.cspViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      window.cspViolations?.push({
        directive: event.violatedDirective,
        blocked: event.blockedURI,
        disposition: event.disposition,
      })
    })
  })
})

test.afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()))
  for (const site of sites) rmSync(site, { recursive: true, force: true })
  servers = []
  sites = []
})

const violations = (page: Page) => page.evaluate(() => window.cspViolations ?? [])

/** Registers the worker as the runtime will, and waits until it controls the page. */
async function install(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
    await navigator.serviceWorker.ready
  })
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
}

const edit = (site: string, file: string, from: RegExp | string, to: string) => {
  const target = path.join(site, file)
  const text = readFileSync(target, 'utf8')
  const edited = text.replace(from, to)
  expect(edited, `${file} holds ${String(from)}`).not.toBe(text)
  writeFileSync(target, edited)
}

const precacheManifest = (site: string): { version: string; hashed: string[]; urls: string[] } => {
  const manifest = /\{"version":[^}]*\}/.exec(readFileSync(path.join(site, 'sw.js'), 'utf8'))
  return JSON.parse(manifest?.[0] ?? '{}') as { version: string; hashed: string[]; urls: string[] }
}

test.describe('headers', () => {
  test('every response carries the security set, a missing page included', async ({ request }) => {
    const site = copyBuild()
    const { url } = await serve(site)
    const rules = parseHeaders(readFileSync(path.join(site, '_headers'), 'utf8'))

    for (const pathname of ['/', '/sw.js', '/manifest.json', '/no-such-page']) {
      const response = await request.get(`${url}${pathname}`)
      const headers = response.headers()
      expect(headers['content-security-policy-report-only']).toContain("default-src 'self'")
      expect(headers['content-security-policy']).toMatch(/^frame-ancestors /)
      expect(headers['cross-origin-opener-policy']).toBe('same-origin')
      expect(headers['cross-origin-resource-policy']).toBe('same-origin')
      expect(headers['cross-origin-embedder-policy']).toBeUndefined()
      expect(headers['x-content-type-options']).toBe('nosniff')
      expect(headersFor(rules, pathname).length).toBeGreaterThan(0)
    }

    const missing = await request.get(`${url}/no-such-page`)
    expect(missing.status()).toBe(404)
    expect(await missing.text()).toContain('Page not found')
    expect((await request.get(`${url}/_headers`)).status()).toBe(404)
  })

  test('the web manifest offers shortcuts and screenshots that exist', async ({ request }) => {
    const { url } = await serve(copyBuild())
    const manifest = (await (await request.get(`${url}/manifest.json`)).json()) as {
      id: string
      shortcuts: { url: string }[]
      screenshots: { src: string }[]
    }

    expect(manifest.id).toBe('/')
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toContain('/?new=easy')
    for (const { src } of manifest.screenshots) {
      const response = await request.get(`${url}${src}`)
      expect(response.status(), src).toBe(200)
      expect(response.headers()['content-type']).toBe('image/png')
    }
  })
})

test.describe('content security policy, reported only', () => {
  test('the app and its 404 page break none of it', async ({ page }) => {
    const { url } = await serve(copyBuild())

    await page.goto(url)
    await expect(page.getByRole('heading', { name: WELCOME })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await install(page)
    await page.reload()
    await expect(page.getByRole('heading', { name: WELCOME })).toBeVisible()
    expect(await violations(page)).toEqual([])

    await page.goto(`${url}/no-such-page`)
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('a style the policy has no hash for is reported and still applied', async ({ page }) => {
    const site = copyBuild()
    edit(site, '_headers', /(Content-Security-Policy-Report-Only:.*style-src 'self')[^;]*/, '$1')
    const { url } = await serve(site)

    await page.goto(`${url}/no-such-page`)
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()

    await expect
      .poll(() => violations(page))
      .toContainEqual(
        expect.objectContaining({
          directive: expect.stringMatching(/^style-src/),
          disposition: 'report',
        }),
      )
    await expect(page.locator('body')).toHaveCSS('display', 'grid')
  })
})

test.describe('service worker', () => {
  test('installs the precache under the wasudoku- prefix', async ({ page }) => {
    const site = copyBuild()
    const { url } = await serve(site)
    const { version, hashed, urls } = precacheManifest(site)

    await page.goto(url)
    await install(page)

    expect(await page.evaluate(() => caches.keys())).toEqual([`wasudoku-${version}`])
    const cached = await page.evaluate(async (name) => {
      const cache = await caches.open(name)
      return (await cache.keys()).map((request) => new URL(request.url).pathname)
    }, `wasudoku-${version}`)
    const expected = [...hashed, ...urls].map((entry) => (entry === './' ? '/' : `/${entry}`))
    expect(cached.sort()).toEqual(expected.sort())
  })

  test('an installed app reloads with its server gone', async ({ page }) => {
    const server = await serve(copyBuild())
    await page.goto(`${server.url}/?p=${'0'.repeat(81)}`)
    await install(page)

    // In WebKit context.setOffline also fails what the worker answers. Stopping the server works everywhere.
    await server.close()
    await page.reload()

    await expect(page.getByRole('heading', { name: WELCOME })).toBeVisible()
    const outside = await page.evaluate(() =>
      fetch('/wasudoku-preview.png').then(
        () => 'loaded',
        () => 'failed',
      ),
    )
    expect(outside).toBe('failed')
  })

  test('a deploy waits behind the cached shell until the page lets its worker take over', async ({
    page,
  }) => {
    const site = copyBuild()
    const { url } = await serve(site)
    await page.goto(url)
    await install(page)

    edit(site, 'index.html', '<html lang="en"', '<html lang="en" data-build="next"')
    edit(site, 'sw.js', /"version":"[0-9a-f]+"/, '"version":"next"')

    // The shell comes from the cache, and the navigation alone makes the browser check sw.js.
    await page.reload()
    await expect(page.locator('html')).not.toHaveAttribute('data-build', 'next')
    const waiting = () =>
      page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state)
    await expect.poll(waiting).toBe('installed')

    const takenOver = page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
            once: true,
          })
        }),
    )
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
    })
    await takenOver
    await page.reload()

    await expect(page.locator('html')).toHaveAttribute('data-build', 'next')
    await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(['wasudoku-next'])
  })
})
