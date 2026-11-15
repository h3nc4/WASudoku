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

import { describe, expect, it } from 'vitest'

import { parseQuery, serializeQuery, splitHref } from './query'
import { buildShareUrl, readSharedPuzzle, SHARE_PARAM, stripSharedPuzzle } from './share'

const puzzle = '1'.repeat(9) + '.'.repeat(72)

// Ported from src/lib/share.test.ts.
describe('buildShareUrl', () => {
  it('keeps the current path and drops any other query or hash', () => {
    expect(buildShareUrl(puzzle, 'https://h3nc4.github.io/WASudoku/?x=1#top')).toBe(
      `https://h3nc4.github.io/WASudoku/?p=${puzzle}`,
    )
  })

  it('adds the query to an address without one', () => {
    expect(buildShareUrl(puzzle, 'https://wasudoku.h3nc4.com/')).toBe(
      `https://wasudoku.h3nc4.com/?p=${puzzle}`,
    )
  })
})

describe('readSharedPuzzle', () => {
  it('returns a valid puzzle from the query', () => {
    expect(SHARE_PARAM).toBe('p')
    expect(readSharedPuzzle(`?p=${puzzle}&utm=a`)).toBe(puzzle)
  })

  it.each(['', '?p=', '?p=123', `?p=${'x'.repeat(81)}`])('rejects %j', (search) => {
    expect(readSharedPuzzle(search)).toBeNull()
  })

  it('reads the first puzzle, escaped or not, and only under its own name', () => {
    expect(readSharedPuzzle(`?p=${puzzle}&p=${'2'.repeat(81)}`)).toBe(puzzle)
    expect(readSharedPuzzle(`%70=%31${puzzle.slice(1)}`)).toBe(puzzle)
    expect(readSharedPuzzle(`?P=${puzzle}`)).toBeNull()
  })
})

describe('stripSharedPuzzle', () => {
  it('removes only the puzzle parameter', () => {
    expect(stripSharedPuzzle(`https://example.com/app/?a=1&p=${puzzle}#h`)).toBe(
      'https://example.com/app/?a=1#h',
    )
  })

  it('drops the query mark once nothing is left, and rewrites the rest as a form', () => {
    expect(stripSharedPuzzle(`https://example.com/app/?p=${puzzle}#h`)).toBe(
      'https://example.com/app/#h',
    )
    expect(stripSharedPuzzle('https://example.com/app/?#h')).toBe('https://example.com/app/#h')
    expect(stripSharedPuzzle('https://example.com/app/?a=b%20c&p=1#h?x')).toBe(
      'https://example.com/app/?a=b+c#h?x',
    )
    expect(stripSharedPuzzle('https://example.com/app/')).toBe('https://example.com/app/')
  })
})

describe('splitHref', () => {
  it('splits at the first query mark before the fragment', () => {
    expect(splitHref('https://e.com/a?b=1?c#d?e#f')).toEqual({
      base: 'https://e.com/a',
      query: 'b=1?c',
      hash: '#d?e#f',
    })
    expect(splitHref('https://e.com/a#d?e')).toEqual({
      base: 'https://e.com/a',
      query: null,
      hash: '#d?e',
    })
  })
})

describe('parseQuery', () => {
  it('splits names from values and skips empty sequences', () => {
    expect(parseQuery('?x&&y=1=2&+z+=a+b')).toEqual([
      ['x', ''],
      ['y', '1=2'],
      [' z ', 'a b'],
    ])
  })

  it('removes only one leading query mark', () => {
    expect(parseQuery('??a=1')).toEqual([['?a', '1']])
  })

  // Chromium, Firefox and WebKit agree on these, while Node and jsdom do not.
  it('decodes raw characters beside invalid escapes as the browsers do', () => {
    expect(parseQuery('%FF  é!')).toEqual([['\uFFFD  é!', '']])
    expect(parseQuery("((%80%ED%A0%80😀%ED%A0%80'")).toEqual([
      ["((\uFFFD\uFFFD\uFFFD\uFFFD😀\uFFFD\uFFFD\uFFFD'", ''],
    ])
  })

  it('keeps a percent sign that starts no escape', () => {
    expect(parseQuery('a=%zz&b=%&c=%4')).toEqual([
      ['a', '%zz'],
      ['b', '%'],
      ['c', '%4'],
    ])
  })

  it.each([
    ['%C3%A9', 'é'],
    ['%c3%a9', 'é'],
    ['é', 'é'],
    ['%F0%9F%98%80', '😀'],
    ['%FF', '�'],
    ['%80', '�'],
    ['%E2%82', '�'],
    ['%C2', '�'],
    ['%C2A', '�A'],
    ['%E0%80%80', '���'],
    ['%ED%A0%80', '���'],
    ['%F4%90%80%80', '����'],
    ['%F0%90', '�'],
    ['%E0%A0%80', 'ࠀ'],
    ['%F4%8F%BF%BF', '\u{10FFFF}'],
    ['\uD800', '�'],
  ])('decodes %j as UTF-8, one replacement per invalid part', (value, decoded) => {
    expect(parseQuery(`a=${value}`)).toEqual([['a', decoded]])
  })
})

describe('serializeQuery', () => {
  it('escapes as a form, a space as a plus', () => {
    expect(
      serializeQuery([
        ['a b', "!'()~*-._"],
        ['\uD800x', 'é😀'],
        ['', ''],
      ]),
    ).toBe('a+b=%21%27%28%29%7E*-._&%EF%BF%BDx=%C3%A9%F0%9F%98%80&=')
  })

  it('writes nothing for no pairs', () => {
    expect(serializeQuery([])).toBe('')
  })
})
