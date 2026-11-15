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

import type { BuiltPage } from './sitemap'

const REFERENCE = /\s(?:href|src)="([^"]*)"/g
const ID = /\sid="([^"]*)"/g
const INDEX = 'index.html'

/** The file a static host serves for a path, where a directory means its index. */
function fileFor(pathname: string, files: ReadonlySet<string>): string | null {
  const name = decodeURIComponent(pathname).slice(1)
  if (name === '' || name.endsWith('/'))
    return files.has(`${name}${INDEX}`) ? `${name}${INDEX}` : null
  if (files.has(name)) return name
  return files.has(`${name}/${INDEX}`) ? `${name}/${INDEX}` : null
}

const idsOf = (html: string): Set<string> =>
  new Set(Array.from(html.matchAll(ID), ([, id = '']) => id))

/** Every same-site link or source in the pages that lacks a built file, or an id on its page. */
export function brokenLinks(
  site: string,
  pages: readonly BuiltPage[],
  files: ReadonlySet<string>,
): string[] {
  const base = new URL(site)
  const html = new Map(pages.map((page) => [page.name, page.html]))
  return pages.flatMap((page) =>
    Array.from(page.html.matchAll(REFERENCE), ([, reference = '']) => reference)
      .filter((reference) => {
        const url = new URL(reference, new URL(page.name, base))
        if (url.origin !== base.origin) return false
        const file = fileFor(url.pathname, files)
        if (file === null) return true
        const fragment = decodeURIComponent(url.hash.slice(1))
        return fragment !== '' && !idsOf(html.get(file) ?? '').has(fragment)
      })
      .map((reference) => `${page.name}: ${reference}`),
  )
}
