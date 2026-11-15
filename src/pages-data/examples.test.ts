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

import { parseCorpus } from './corpus'
import { stuckExample, techniqueExample } from './examples'

// The first puzzle is no board and is skipped. In the second, row 1 lacks only 9,
// so R1C9 is a naked single, and a pair then strikes two digits from R2C1.
const PUZZLE = `12345678.${'.'.repeat(72)}`

const CORPUS = parseCorpus(
  [
    `PUZZLE ${'x'.repeat(81)}`,
    'NakedPair p e 0=1 c',
    `PUZZLE ${PUZZLE}`,
    'NakedSingle p 8=9 e 17=9 c',
    'NakedPair p e 9=4 10=4 9=5 c 18=[4, 5] 19=[4, 5]',
  ].join('\n'),
)

describe('techniqueExample', () => {
  it('draws the board before the step, with givens, the placement and the struck notes', () => {
    const example = techniqueExample(CORPUS, 'NakedPair')
    expect(example?.puzzle).toBe(PUZZLE)
    expect(example?.caption).toBe(
      "Naked Pair in puzzle 2 of the solver's test corpus, step 2 of 2. Cells R3C1 and R3C2 can only contain 4 or 5. So 4 and 5 are removed from the other cells in the same unit.",
    )
    expect(example?.facts).toEqual([
      'The pattern cells are R3C1 and R3C2.',
      'Candidate 4 is removed from R2C1 and R2C2.',
      'Candidate 5 is removed from R2C1.',
    ])
    const cells = example?.cells ?? []
    expect(cells[0]).toEqual({ value: 1, given: true })
    expect(cells[8]).toEqual({ value: 9, solved: true })
    expect(cells[9]).toEqual({ corner: [4, 5, 6, 7, 8, 9], struck: [4, 5] })
    expect(cells[17]).toEqual({ corner: [1, 2, 3, 4, 5, 6] })
    expect(cells[18]).toEqual({ corner: [4, 5, 6, 7, 8, 9], cause: true })
  })

  it('lists a placement but not the peers it clears', () => {
    const example = techniqueExample(CORPUS, 'NakedSingle')
    expect(example?.facts).toEqual(['9 is placed in R1C9.'])
    expect(example?.cells[8]).toEqual({ value: 9, placed: true })
    expect(example?.cells[17]).toEqual({ corner: [1, 2, 3, 4, 5, 6, 9], struck: [9] })
  })

  it('marks a placed cell that is also part of the pattern', () => {
    const corpus = parseCorpus(`PUZZLE ${PUZZLE}\nHiddenSingle p 8=9 e c 8=[]`)
    const example = techniqueExample(corpus, 'HiddenSingle')
    expect(example?.cells[8]).toEqual({ value: 9, placed: true, cause: true })
  })

  it('finds nothing for a technique the corpus lacks', () => {
    expect(techniqueExample(CORPUS, 'Jellyfish')).toBeNull()
  })
})

describe('stuckExample', () => {
  it('draws the first board that logic leaves open, after its last step', () => {
    const example = stuckExample(CORPUS)
    expect(example?.caption).toBe(
      "Puzzle 2 of the solver's test corpus after its last logical step, 2 of 2. From here a search finishes the board.",
    )
    expect(example?.facts).toEqual([
      '72 cells are still empty, each shown with its remaining candidates.',
    ])
    expect(example?.cells[8]).toEqual({ value: 9, solved: true })
    expect(example?.cells[9]).toEqual({ corner: [6, 7, 8, 9] })
  })

  it('finds nothing when logic finishes every board', () => {
    const solved =
      '123456789456789123789123456214365897365897214897214365531642978642978531978531642'
    expect(stuckExample([{ puzzle: solved, steps: [] }])).toBeNull()
  })
})
