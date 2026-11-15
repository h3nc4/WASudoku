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

import { beforeAll, describe, expect, it } from 'vitest'

import { type Technique, TECHNIQUES } from '../core/game/steps'
import { initSync, validate_puzzle } from '../wasudoku-wasm/pkg/wasudoku_wasm'
import { parseCorpus } from './corpus'
import {
  FINDERS,
  levelOf,
  PAGE_ORDER,
  playLink,
  techniquePage,
  techniquePaths,
  techniqueSlug,
} from './techniques'

// Runs the built crate, so this suite needs `npm run wasm:build:dev` first, as CI does.
const WASM_PATH = resolve('src/wasudoku-wasm/pkg/wasudoku_wasm_bg.wasm')
const SOLVER_SOURCE = resolve('src/wasudoku-wasm/src/logical_solver/mod.rs')

/** What each Rust finder reports, by its function name. */
const RUST_FINDERS: Readonly<Record<string, readonly Technique[]>> = {
  find_naked_single: ['NakedSingle'],
  find_hidden_single: ['HiddenSingle'],
  find_naked_pair: ['NakedPair'],
  find_naked_triple: ['NakedTriple'],
  find_pointing_subset: ['PointingPair', 'PointingTriple'],
  find_hidden_pair: ['HiddenPair'],
  find_hidden_triple: ['HiddenTriple'],
  find_claiming_candidates: ['ClaimingCandidate'],
  find_fish_techniques: ['X-Wing', 'Swordfish', 'Jellyfish'],
  find_xy_wing: ['XY-Wing'],
  find_xyz_wing: ['XYZ-Wing'],
  find_skyscraper: ['Skyscraper'],
  find_two_string_kite: ['TwoStringKite'],
  find_unique_rectangle_type_1: ['UniqueRectangleType1'],
  find_w_wing: ['W-Wing'],
}

describe('the finder order', () => {
  it('matches the FINDERS table in logical_solver/mod.rs, with its levels', () => {
    const source = readFileSync(SOLVER_SOURCE, 'utf8')
    const table = /const FINDERS[^=]*= \[([\s\S]*?)\n\];/.exec(source)?.[1] ?? ''
    const rows = [...table.matchAll(/::(find_\w+),\s*TechniqueLevel::(\w+)/g)]
    expect(rows).toHaveLength(FINDERS.length)
    expect(rows.map(([, name = '', level]) => ({ techniques: RUST_FINDERS[name], level }))).toEqual(
      FINDERS,
    )
  })

  it('puts every technique on one page each, backtracking last', () => {
    expect([...PAGE_ORDER].sort()).toEqual([...TECHNIQUES].sort())
    expect(PAGE_ORDER.at(-1)).toBe('Backtracking')
  })

  it('grades Jellyfish above its finder, and backtracking at no level', () => {
    expect(levelOf('Swordfish')).toBe('Advanced')
    expect(levelOf('Jellyfish')).toBe('Master')
    expect(levelOf('Backtracking')).toBeNull()
  })
})

describe('techniqueSlug', () => {
  it.each([
    ['ClaimingCandidate', 'box-line-reduction'],
    ['XYZ-Wing', 'xyz-wing'],
    ['UniqueRectangleType1', 'unique-rectangle-type-1'],
    ['TwoStringKite', 'two-string-kite'],
  ] as const)('names %s %s', (technique, slug) => {
    expect(techniqueSlug(technique)).toBe(slug)
  })

  it('gives every technique its own slug', () => {
    expect(new Set(TECHNIQUES.map(techniqueSlug)).size).toBe(TECHNIQUES.length)
  })
})

describe('techniquePaths', () => {
  const paths = techniquePaths()

  beforeAll(() => {
    initSync({ module: readFileSync(WASM_PATH) })
  })

  it('makes one page per technique, in solver order', () => {
    expect(paths.map(({ params }) => params.slug)).toEqual(PAGE_ORDER.map(techniqueSlug))
  })

  it('links each page to its neighbours in that order', () => {
    const [first] = paths
    const last = paths.at(-1)
    expect(first?.props.page.previous).toBeNull()
    expect(first?.props.page.next).toEqual({
      href: '/techniques/hidden-single/',
      label: 'Hidden Single',
    })
    expect(last?.props.page.next).toBeNull()
    expect(last?.props.page.previous?.label).toBe('W-Wing')
  })

  it('draws a real example of each technique, from a puzzle with one solution', () => {
    for (const { props } of paths) {
      const { example, playHref, name } = props.page
      expect(example.caption, name).toContain(" of the solver's test corpus")
      expect(playHref).toBe(playLink(example.puzzle))
      expect(validate_puzzle(example.puzzle), name).toMatch(/^[1-9]{81}$/)
    }
  })

  it('describes each page as an article with a canonical path', () => {
    const page = techniquePage('X-Wing')
    expect(page.meta).toMatchObject({
      title: 'X-Wing Sudoku technique - WASudoku',
      path: '/techniques/x-wing/',
      type: 'article',
      jsonLd: { '@type': 'Article', headline: 'X-Wing Sudoku technique - WASudoku' },
    })
    expect(page.paragraphs[0]).toBe(page.meta.description)
  })

  it('refuses a corpus without an example', () => {
    expect(() => techniquePage('Jellyfish', parseCorpus(''))).toThrow('no example of Jellyfish')
    expect(() => techniquePage('Backtracking', parseCorpus(''))).toThrow('no example')
  })
})
