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

import { byCodeUnit } from './order'

/** A built page, by its path in the output directory. */
export interface BuiltPage {
  readonly name: string
  readonly html: string
}

const INDEX = 'index.html'
const HTML = '.html'
const NOT_FOUND = '404.html'
const NOINDEX = /<meta\s+name=["']?robots["']?\s+content=["'][^"']*noindex/i
const DATE_LENGTH = 10
const MS_PER_SECOND = 1000

/** The path a static host serves a built file at, a directory index ending in a slash. */
export function servedPath(name: string): string {
  if (name === INDEX) return '/'
  if (name.endsWith(`/${INDEX}`)) return `/${name.slice(0, -INDEX.length)}`
  return `/${name.endsWith(HTML) ? name.slice(0, -HTML.length) : name}`
}

/** Every page a crawler should find, leaving out the 404 page and any page marked noindex. */
export const indexedPaths = (pages: readonly BuiltPage[]): string[] =>
  pages
    .filter(({ name, html }) => name.endsWith(HTML) && name !== NOT_FOUND && !NOINDEX.test(html))
    .map(({ name }) => servedPath(name))
    .sort(byCodeUnit)

/** The build's day as YYYY-MM-DD, from SOURCE_DATE_EPOCH when set so a rebuild matches. */
export function buildDay(sourceDateEpoch: string | undefined, now: Date): string {
  const epoch = Number(sourceDateEpoch)
  const date = sourceDateEpoch && Number.isFinite(epoch) ? new Date(epoch * MS_PER_SECOND) : now
  return date.toISOString().slice(0, DATE_LENGTH)
}

export const sitemapXml = (site: string, paths: readonly string[], lastmod: string): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map(
      (path) =>
        `  <url>\n    <loc>${new URL(path, site).href}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`,
    ),
    '</urlset>',
    '',
  ].join('\n')
