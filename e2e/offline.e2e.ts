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

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { preview, type PreviewServer } from 'vite'

import { STORAGE_KEYS } from '../src/context/sudoku.persistence'
import { board, expect, mistakes, readBoard, test } from './fixtures'

// Each journey runs its own server, since it stops it or deploys into its directory.
let server: PreviewServer | undefined

async function serve(outDir = 'dist'): Promise<string> {
  server = await preview({ build: { outDir }, preview: { port: 0 }, logLevel: 'silent' })
  const [url] = server.resolvedUrls?.local ?? []
  return url
}

async function stopServer() {
  await server?.close()
  server = undefined
}

test.afterEach(stopServer)

// In WebKit context.setOffline also fails what the service worker answers. Stopping the server works everywhere.
test('an installed app generates a puzzle once its server is gone', async ({ page, open }) => {
  await open({ path: await serve(), pool: false })
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  // A clean start with an empty pool, so the puzzle has to come from the solver worker.
  await page.addInitScript(
    (keys) => {
      for (const key of keys) localStorage.removeItem(key)
    },
    [STORAGE_KEYS.GAME, STORAGE_KEYS.POOL],
  )
  await stopServer()
  await page.reload()

  await expect(page.getByRole('heading', { name: 'Welcome to WASudoku' })).toBeVisible()
  await page.getByRole('button', { name: 'Easy', exact: true }).click()

  await expect(board(page)).toBeVisible()
  await expect(mistakes(page)).toHaveText('0/3')
  const givens = [...(await readBoard(page))].filter((d) => d !== '.').length
  expect(givens).toBeGreaterThanOrEqual(17)
  expect(givens).toBeLessThan(81)

  // A file outside the precache fails to load, proof that the network answered none of this.
  const outside = await page.evaluate(() =>
    fetch('/wasudoku-preview.png').then(
      () => 'loaded',
      () => 'failed',
    ),
  )
  expect(outside).toBe('failed')
})

test('a reload after a deploy serves the new build and offers its worker', async ({
  page,
  open,
}) => {
  const site = mkdtempSync(path.join(tmpdir(), 'wasudoku-deploy-'))
  cpSync('dist', site, { recursive: true })
  try {
    await open({ path: await serve(site) })
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

    const edit = (file: string, from: RegExp | string, to: string) => {
      const target = path.join(site, file)
      writeFileSync(target, readFileSync(target, 'utf8').replace(from, to))
    }
    edit('index.html', '<html lang="en">', '<html lang="en" data-build="next">')
    edit('sw.js', /"version":"[0-9a-f]+"/, '"version":"next"')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-build', 'next')

    const update = page.getByRole('button', { name: 'Reload', exact: true })
    await expect(page.getByText('Update available')).toBeVisible()
    const reloaded = page.waitForEvent('load')
    await update.click()
    await reloaded

    await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(['wasudoku-next'])
    await expect(update).toBeHidden()
    await expect(page.locator('html')).toHaveAttribute('data-build', 'next')
  } finally {
    rmSync(site, { recursive: true, force: true })
  }
})
