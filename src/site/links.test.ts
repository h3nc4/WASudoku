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

import { brokenLinks } from './links'

const SITE = 'https://wasudoku.h3nc4.com'
const FILES = new Set([
  'index.html',
  'solver/index.html',
  'techniques/x-wing/index.html',
  'favicon.svg',
  'assets/app.js',
])

const page = (name: string, html: string) => ({ name, html })
const pages = (html: string) => [
  page('index.html', '<h1 id="top">App</h1>'),
  page('solver/index.html', '<h2 id="techniques">Order</h2>'),
  page('techniques/x-wing/index.html', html),
]

describe('brokenLinks', () => {
  it('accepts links to pages, files, directories, queries and ids that exist', () => {
    const html = [
      '<a href="/">Home</a>',
      '<a href="/?p=123">Play</a>',
      '<a href="/solver/#techniques">All</a>',
      '<a href="/solver">No slash</a>',
      '<a href="../../solver/">Relative</a>',
      '<link rel="icon" href="/favicon.svg" />',
      '<script src="/assets/app.js"></script>',
      '<link rel="canonical" href="https://wasudoku.h3nc4.com/techniques/x-wing/" />',
      '<a href="https://h3nc4.com">Author</a>',
      '<a href="mailto:someone@example.com">Mail</a>',
      '<a href="/#top">Top of the app</a>',
      '<h1 id="here">X-Wing</h1><a href="#here">Here</a>',
    ].join('')
    expect(brokenLinks(SITE, pages(html), FILES)).toEqual([])
  })

  it('reports each missing file, directory index and fragment by page', () => {
    const html = [
      '<a href="/techniques/none/">Missing page</a>',
      '<img src="/missing.png" />',
      '<a href="/solver/#nowhere">Missing id</a>',
      '<a href="/favicon.svg#icon">Not a page</a>',
      '<link rel="canonical" href="https://wasudoku.h3nc4.com/gone/" />',
    ].join('')
    expect(brokenLinks(SITE, pages(html), FILES)).toEqual([
      'techniques/x-wing/index.html: /techniques/none/',
      'techniques/x-wing/index.html: /missing.png',
      'techniques/x-wing/index.html: /solver/#nowhere',
      'techniques/x-wing/index.html: /favicon.svg#icon',
      'techniques/x-wing/index.html: https://wasudoku.h3nc4.com/gone/',
    ])
  })
})
