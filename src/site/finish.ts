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

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { contentSecurityPolicy, formatHeaders, headerRules, inlineSources } from './headers'
import { brokenLinks } from './links'
import { injectManifest, precacheCandidates, precacheManifest, readTree } from './precache'
import { indexedPaths, sitemapXml } from './sitemap'
import { pngSize, SCREENSHOTS, SCREENSHOTS_DIR, webManifest } from './web-manifest'

export interface FinishOptions {
  /** The directory the static build wrote. */
  readonly outDir: string
  readonly assetsDir: string
  /** The public/ manifest.json, which the build extends. */
  readonly baseManifest: string
  /** Where the screenshots of the install sheet are kept. */
  readonly screenshotsDir: string
  /** Bundles the service worker into one classic script, still holding its placeholder. */
  readonly bundleWorker: () => Promise<string>
  /** The origin the canonical links name, which counts as the build's own in a link. */
  readonly site: string
  /** The day the sitemap stamps on every page, as YYYY-MM-DD. */
  readonly lastmod: string
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** What the build writes after the pages, in order, since each step reads what the last wrote. */
export async function finishBuild(options: FinishOptions): Promise<void> {
  const { outDir, assetsDir, screenshotsDir } = options
  const write = (name: string, content: string) => {
    writeFileSync(path.join(outDir, name), content)
  }

  const base: unknown = JSON.parse(options.baseManifest)
  if (!isRecord(base)) throw new Error('manifest.json holds no object')
  mkdirSync(path.join(outDir, SCREENSHOTS_DIR), { recursive: true })
  const sizes = new Map<string, string>()
  for (const { name } of SCREENSHOTS) {
    const source = path.join(screenshotsDir, name)
    sizes.set(name, pngSize(readFileSync(source)))
    copyFileSync(source, path.join(outDir, SCREENSHOTS_DIR, name))
  }
  write('manifest.json', `${JSON.stringify(webManifest(base, sizes), null, 2)}\n`)

  const files = readTree(outDir)
  const manifest = precacheManifest(precacheCandidates(files, assetsDir), assetsDir)
  write('sw.js', injectManifest(await options.bundleWorker(), manifest))

  const decoder = new TextDecoder()
  const pages = files
    .filter(({ name }) => name.endsWith('.html'))
    .map(({ name, content }) => ({ name, html: decoder.decode(content) }))
  const broken = brokenLinks(options.site, pages, new Set(files.map(({ name }) => name)))
  if (broken.length > 0) throw new Error(`links that name no built file:\n${broken.join('\n')}`)
  write('sitemap.xml', sitemapXml(options.site, indexedPaths(pages), options.lastmod))
  write(
    '_headers',
    formatHeaders(headerRules(contentSecurityPolicy(inlineSources(pages.map(({ html }) => html))))),
  )
}
