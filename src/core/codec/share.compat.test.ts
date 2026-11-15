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

// jsdom's URLSearchParams mangles raw astral characters, so this compares with Node's own.
// @vitest-environment node

import { describe, expect, it } from 'vitest'

import * as old from '@/lib/share'

import { parseQuery, type QueryPair, serializeQuery } from './query'
import { buildShareUrl, readSharedPuzzle, stripSharedPuzzle } from './share'

const PUZZLE = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79'

/** A seeded generator, so a failing case can be replayed. */
function random(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

// Pieces that exercise every branch of the form codec, valid and invalid UTF-8 escapes included.
// A query read off an address is ASCII, and Node decodes raw non-ASCII beside a bad escape wrongly.
const PIECES = [
  'p',
  'P',
  '=',
  '&',
  '?',
  '+',
  ' ',
  '%',
  '%2',
  '%zz',
  '%70',
  '%3D',
  '%26',
  '%20',
  '%2B',
  '%C3%A9',
  '%E2%82',
  '%FF',
  '%80',
  '%E0%80%80',
  '%ED%A0%80',
  '%F0%9F%98%80',
  '%F4%90%80%80',
  '~',
  "'",
  '(',
  '!',
  '*',
  '.',
  '_',
  '-',
  '1',
  '0',
  'a',
  'Z',
  PUZZLE,
  `p=${PUZZLE}`,
  '%3F',
]

const queries = (seed: number, count: number): string[] => {
  const next = random(seed)
  return Array.from({ length: count }, () =>
    Array.from(
      { length: Math.floor(next() * 8) },
      () => PIECES[Math.floor(next() * PIECES.length)],
    ).join(''),
  )
}

const BASES = [
  'https://wasudoku.h3nc4.com/',
  'https://gh.wasudoku.h3nc4.com/WASudoku/',
  'http://localhost:4173/',
  'http://192.168.0.3:5173/app/index.html',
  'https://example.com/a%20b/',
]

const normal = (href: string) => new URL(href).href

const hrefs = queries(7, 400).map((query, i) => {
  const base = BASES[i % BASES.length] ?? BASES[0]
  const hash = i % 3 === 0 ? '' : `#h${i % 2 === 0 ? '?x=1' : ''}`
  return normal(`${base}${i % 5 === 0 ? '' : '?'}${query}${hash}`)
})

describe('share cross-compatibility', () => {
  it('runs against the URL of Node, not of jsdom', () => {
    expect(typeof document).toBe('undefined')
  })

  it.each(queries(1, 400))('reads %j as today', (search) => {
    expect(readSharedPuzzle(search)).toBe(old.readSharedPuzzle(search))
    expect(readSharedPuzzle(`?${search}`)).toBe(old.readSharedPuzzle(`?${search}`))
  })

  it('reads every puzzle link of today', () => {
    const links = [`?p=${PUZZLE}`, `?utm=a&p=${PUZZLE}`, `?p=${PUZZLE.replaceAll('.', '0')}#x`]
    for (const search of links) expect(readSharedPuzzle(search)).toBe(old.readSharedPuzzle(search))
    expect(readSharedPuzzle(`?p=${PUZZLE}`)).toBe(PUZZLE)
  })

  it.each(hrefs)('strips %j as today', (href) => {
    expect(stripSharedPuzzle(href)).toBe(old.stripSharedPuzzle(href))
  })

  it.each(hrefs)('builds a link from %j as today', (href) => {
    expect(buildShareUrl(PUZZLE, href)).toBe(old.buildShareUrl(PUZZLE, href))
  })

  it.each(queries(3, 200))('builds a link for the puzzle %j as today', (puzzle) => {
    const href = 'https://wasudoku.h3nc4.com/?x=1#top'
    expect(buildShareUrl(puzzle, href)).toBe(old.buildShareUrl(puzzle, href))
  })
})

describe('form codec against URLSearchParams', () => {
  it.each(queries(11, 400))('parses %j as URLSearchParams does', (search) => {
    expect(parseQuery(search)).toEqual([...new URLSearchParams(search)])
  })

  const RAW = ['é', '😀', '\uD800', '\uDC00']

  it.each(RAW)('parses the raw character %j as URLSearchParams does', (char) => {
    expect(parseQuery(`${char}=${char}`)).toEqual([...new URLSearchParams(`${char}=${char}`)])
  })

  it.each([...queries(13, 200), ...RAW])(
    'serializes pairs of %j as URLSearchParams does',
    (text) => {
      const pairs: QueryPair[] = [
        [text, text.split('').reverse().join('')],
        ['', text],
      ]
      expect(serializeQuery(pairs)).toBe(new URLSearchParams(pairs.map((p) => [...p])).toString())
    },
  )
})
