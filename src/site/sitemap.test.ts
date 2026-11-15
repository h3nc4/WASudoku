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

import { describe, expect, it } from 'vitest'

import { buildDay, indexedPaths, servedPath, sitemapXml } from './sitemap'

describe('servedPath', () => {
  it.each([
    ['index.html', '/'],
    ['solver/index.html', '/solver/'],
    ['techniques/x-wing/index.html', '/techniques/x-wing/'],
    ['about.html', '/about'],
    ['robots.txt', '/robots.txt'],
  ])('serves %s at %s', (name, path) => {
    expect(servedPath(name)).toBe(path)
  })
})

describe('indexedPaths', () => {
  it('lists the pages in order, without the 404 page, noindex pages or other files', () => {
    expect(
      indexedPaths([
        { name: 'solver/index.html', html: '<h1>Solver</h1>' },
        { name: 'index.html', html: '<h1>App</h1>' },
        { name: '404.html', html: '<h1>Missing</h1>' },
        { name: 'hidden/index.html', html: '<meta name="robots" content="noindex" />' },
        { name: 'sitemap.xml', html: '' },
      ]),
    ).toEqual(['/', '/solver/'])
  })
})

describe('buildDay', () => {
  const now = new Date('2026-11-15T23:30:00Z')

  it('takes SOURCE_DATE_EPOCH when it holds a number', () => {
    expect(buildDay('1700000000', now)).toBe('2023-11-14')
  })

  it.each([undefined, '', 'soon'])('falls back to the clock for %j', (epoch) => {
    expect(buildDay(epoch, now)).toBe('2026-11-15')
  })
})

describe('sitemapXml', () => {
  it('writes one absolute url per path with its lastmod', () => {
    expect(sitemapXml('https://wasudoku.h3nc4.com', ['/', '/solver/'], '2026-11-15')).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url>',
        '    <loc>https://wasudoku.h3nc4.com/</loc>',
        '    <lastmod>2026-11-15</lastmod>',
        '  </url>',
        '  <url>',
        '    <loc>https://wasudoku.h3nc4.com/solver/</loc>',
        '    <lastmod>2026-11-15</lastmod>',
        '  </url>',
        '</urlset>',
        '',
      ].join('\n'),
    )
  })
})
