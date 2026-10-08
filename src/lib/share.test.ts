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

import { buildShareUrl, readSharedPuzzle, stripSharedPuzzle } from './share'

const puzzle = '1'.repeat(9) + '.'.repeat(72)

describe('buildShareUrl', () => {
  it('keeps the current path and drops any other query or hash', () => {
    expect(buildShareUrl(puzzle, 'https://h3nc4.github.io/WASudoku/?x=1#top')).toBe(
      `https://h3nc4.github.io/WASudoku/?p=${puzzle}`,
    )
  })
})

describe('readSharedPuzzle', () => {
  it('returns a valid puzzle from the query', () => {
    expect(readSharedPuzzle(`?p=${puzzle}&utm=a`)).toBe(puzzle)
  })

  it.each(['', '?p=', '?p=123', `?p=${'x'.repeat(81)}`])('rejects %j', (search) => {
    expect(readSharedPuzzle(search)).toBeNull()
  })
})

describe('stripSharedPuzzle', () => {
  it('removes only the puzzle parameter', () => {
    expect(stripSharedPuzzle(`https://example.com/app/?a=1&p=${puzzle}#h`)).toBe(
      'https://example.com/app/?a=1#h',
    )
  })
})
