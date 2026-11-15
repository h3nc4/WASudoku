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

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { finishBuild, type FinishOptions } from './finish'
import { headersFor, parseHeaders, sourceHash } from './headers'

const STYLE = '@font-face{src:url(/assets/main.woff2)}'
// Like the theme script the layout runs before the first paint.
const THEME = "document.documentElement.dataset.theme='dark'"

/** A PNG signature and IHDR size, which is all the build reads of a screenshot. */
function png(width: number, height: number) {
  const bytes = Buffer.alloc(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

describe('finishBuild', () => {
  let root = ''
  let options: FinishOptions

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'wasudoku-finish-'))
    const outDir = path.join(root, 'dist')
    const screenshotsDir = path.join(root, 'screenshots')
    mkdirSync(path.join(outDir, 'assets'), { recursive: true })
    mkdirSync(screenshotsDir)
    writeFileSync(
      path.join(outDir, 'index.html'),
      `<script>${THEME}</script><style>${STYLE}</style><p>Sudoku</p>`,
    )
    writeFileSync(path.join(outDir, '404.html'), '<style>p{}</style>')
    writeFileSync(path.join(outDir, 'assets', 'main.woff2'), 'font')
    writeFileSync(path.join(outDir, 'robots.txt'), 'User-agent: *')
    writeFileSync(path.join(screenshotsDir, 'narrow.png'), png(1080, 1920))
    writeFileSync(path.join(screenshotsDir, 'wide.png'), png(1920, 1200))
    options = {
      outDir,
      assetsDir: 'assets',
      baseManifest: JSON.stringify({ name: 'WASudoku' }),
      screenshotsDir,
      bundleWorker: () => Promise.resolve('setUp(__PRECACHE_MANIFEST__)'),
      site: 'https://wasudoku.h3nc4.com',
      lastmod: '2026-11-15',
    }
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const read = (name: string) => readFileSync(path.join(options.outDir, name), 'utf8')

  it('writes the worker with a manifest of what the build holds, its own manifest included', async () => {
    await finishBuild(options)

    const manifest: unknown = JSON.parse(/^setUp\((.*)\)$/.exec(read('sw.js'))?.[1] ?? '')
    expect(manifest).toEqual({
      version: expect.stringMatching(/^[0-9a-f]{16}$/),
      hashed: ['assets/main.woff2'],
      urls: ['./', 'manifest.json'],
      assetsDir: 'assets',
    })
  })

  it('extends the web manifest with screenshots it copies and measures', async () => {
    await finishBuild(options)

    const manifest: unknown = JSON.parse(read('manifest.json'))
    expect(manifest).toMatchObject({
      name: 'WASudoku',
      id: '/',
      screenshots: [{ sizes: '1080x1920' }, { sizes: '1920x1200', form_factor: 'wide' }],
    })
    expect(existsSync(path.join(options.outDir, 'screenshots', 'wide.png'))).toBe(true)
  })

  it('writes edge headers whose policy allows the inline code of every page', async () => {
    await finishBuild(options)

    const policy = new Map(headersFor(parseHeaders(read('_headers')), '/no-such-page')).get(
      'Content-Security-Policy-Report-Only',
    )
    expect(policy).toContain(`style-src 'self' ${sourceHash(STYLE)} ${sourceHash('p{}')};`)
    expect(policy).toContain(`script-src 'self' 'wasm-unsafe-eval' ${sourceHash(THEME)};`)
  })

  it('writes a sitemap of the indexed pages, leaving the 404 page out', async () => {
    writeFileSync(path.join(options.outDir, 'index.html'), '<a href="/solver/">How</a>')
    mkdirSync(path.join(options.outDir, 'solver'))
    writeFileSync(path.join(options.outDir, 'solver', 'index.html'), '<a href="../">Home</a>')
    await finishBuild(options)

    const sitemap = read('sitemap.xml')
    expect([...sitemap.matchAll(/<loc>(.*)<\/loc>/g)].map(([, loc]) => loc)).toEqual([
      'https://wasudoku.h3nc4.com/',
      'https://wasudoku.h3nc4.com/solver/',
    ])
    expect(sitemap).toContain('<lastmod>2026-11-15</lastmod>')
  })

  it('refuses a build whose pages link to a file it lacks', async () => {
    writeFileSync(path.join(options.outDir, 'index.html'), '<a href="/techniques/none/">None</a>')
    await expect(finishBuild(options)).rejects.toThrow('index.html: /techniques/none/')
    expect(existsSync(path.join(options.outDir, 'sitemap.xml'))).toBe(false)
  })

  it('refuses a base manifest that holds no object', async () => {
    await expect(finishBuild({ ...options, baseManifest: '[]' })).rejects.toThrow('no object')
    await expect(finishBuild({ ...options, baseManifest: 'null' })).rejects.toThrow('no object')
  })
})
