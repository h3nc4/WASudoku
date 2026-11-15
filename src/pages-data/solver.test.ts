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

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ALL_TECHNIQUES, finderRows, SEARCH, SEARCH_BUDGET, SOLVER_META } from './solver'

describe('finderRows', () => {
  it('lists every logical technique, sharing a position where one finder reports several', () => {
    const rows = finderRows()
    expect(rows).toHaveLength(18)
    expect(rows.slice(9, 12)).toEqual([
      { position: 9, level: 'Advanced', href: '/techniques/x-wing/', label: 'X-Wing' },
      { position: 9, level: 'Advanced', href: '/techniques/swordfish/', label: 'Swordfish' },
      { position: 9, level: 'Master', href: '/techniques/jellyfish/', label: 'Jellyfish' },
    ])
    expect(rows.at(-1)).toMatchObject({ position: 15, label: 'W-Wing' })
  })
})

describe('the solver page', () => {
  it('states the search budget api.rs sets', () => {
    const source = readFileSync(resolve('src/wasudoku-wasm/src/api.rs'), 'utf8')
    const shift = Number(/SEARCH_BUDGET: Budget = 1 << (\d+);/.exec(source)?.[1])
    expect(SEARCH_BUDGET).toBe(2 ** shift)
    expect(SEARCH.paragraphs.join(' ')).toContain('2,097,152 guesses')
  })

  it('links to the technique table and describes itself as a technical article', () => {
    expect(ALL_TECHNIQUES.href).toBe('/solver/#techniques')
    expect(SOLVER_META.jsonLd).toMatchObject({
      '@type': 'TechArticle',
      url: 'https://wasudoku.h3nc4.com/solver/',
    })
  })
})
