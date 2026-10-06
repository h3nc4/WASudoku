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

import type { SolvingStep } from '@/context/sudoku.types'

import { getHintExplanation, getStepExplanation, getTechniqueName } from './techniques'

const step = (technique: string, rest: Partial<SolvingStep> = {}): SolvingStep => ({
  technique,
  placements: [],
  eliminations: [],
  cause: [],
  ...rest,
})

describe('getTechniqueName', () => {
  it.each([
    ['NakedSingle', 'Naked Single'],
    ['HiddenPair', 'Hidden Pair'],
    ['X-Wing', 'X-Wing'],
    ['ClaimingCandidate', 'Box-Line Reduction'],
    ['TwoStringKite', 'Two-String Kite'],
    ['UniqueRectangleType1', 'Unique Rectangle Type 1'],
  ])('names %s as %s', (id, name) => {
    expect(getTechniqueName(id)).toBe(name)
  })

  it('splits an unknown id at its capitals', () => {
    expect(getTechniqueName('FinnedSashimiFish2')).toBe('Finned Sashimi Fish 2')
  })
})

describe('getStepExplanation', () => {
  const cases: [SolvingStep, RegExp][] = [
    [
      step('NakedSingle', { placements: [{ index: 0, value: 5 }] }),
      /^Cell R1C1 has only one possible candidate left, 5\.$/,
    ],
    [
      step('HiddenSingle', { placements: [{ index: 10, value: 3 }] }),
      /the number 3 fits only in cell R2C2\./,
    ],
    [
      step('NakedPair', {
        cause: [
          { index: 1, candidates: [6, 4] },
          { index: 2, candidates: [4, 6] },
        ],
      }),
      /^Cells R1C2, R1C3 can only contain the candidates \{4, 6\}/,
    ],
    [
      step('NakedTriple', {
        cause: [
          { index: 30, candidates: [1, 2, 3] },
          { index: 31, candidates: [1, 2] },
          { index: 32, candidates: [2, 3] },
        ],
      }),
      /^Cells R4C4, R4C5, R4C6 can only contain the candidates \{1, 2, 3\}/,
    ],
    [
      step('HiddenPair', {
        cause: [
          { index: 20, candidates: [7, 8] },
          { index: 21, candidates: [7, 8] },
        ],
      }),
      /the candidates \{7, 8\} only appear in cells R3C3, R3C4/,
    ],
    [
      step('HiddenTriple', { cause: [{ index: 40, candidates: [5, 6, 9] }] }),
      /the candidates \{5, 6, 9\} only appear in cells R5C5/,
    ],
    [
      step('PointingPair', {
        cause: [
          { index: 0, candidates: [8] },
          { index: 1, candidates: [8] },
        ],
      }),
      /^In box 1, the candidate 8 only appears in R1C1, R1C2, which all lie in row 1\. So 8 is removed from the rest of row 1\.$/,
    ],
    [
      step('PointingTriple', {
        cause: [
          { index: 5, candidates: [1] },
          { index: 14, candidates: [1] },
          { index: 23, candidates: [1] },
        ],
      }),
      /^In box 2, the candidate 1 only appears in R1C6, R2C6, R3C6, which all lie in column 6\./,
    ],
    [
      step('ClaimingCandidate', {
        cause: [
          { index: 60, candidates: [2] },
          { index: 61, candidates: [2] },
        ],
      }),
      /^In row 7, the candidate 2 only appears in R7C7, R7C8, which all lie in box 9\. So 2 is removed from the rest of that box\.$/,
    ],
    [
      step('ClaimingCandidate', { cause: [{ index: 70, candidates: [2] }] }),
      /^In row 8, the candidate 2 only appears in R8C8/,
    ],
    [step('X-Wing', { cause: [{ index: 0, candidates: [5] }] }), /rectangle at R1C1/],
    [
      step('Swordfish', { cause: [{ index: 0, candidates: [7] }] }),
      /^The candidate 7 appears in only two or three positions in three rows/,
    ],
    [
      step('Jellyfish', { cause: [{ index: 0, candidates: [4] }] }),
      /^The candidate 4 appears in positions across four rows/,
    ],
    [
      step('XY-Wing', {
        eliminations: [{ index: 20, value: 3 }],
        cause: [
          { index: 0, candidates: [1, 2] },
          { index: 1, candidates: [1, 3] },
          { index: 9, candidates: [2, 3] },
        ],
      }),
      /^Pivot R1C1 and pincers R1C2, R2C1 form a Y-Wing pattern.*3 can be removed/,
    ],
    [
      step('XYZ-Wing', {
        eliminations: [{ index: 20, value: 3 }],
        cause: [
          { index: 0, candidates: [1, 2, 3] },
          { index: 1, candidates: [1, 3] },
          { index: 9, candidates: [2, 3] },
        ],
      }),
      /^Pivot R1C1 and pincers R1C2, R2C1 form a bent triple/,
    ],
    [
      step('Skyscraper', { cause: [{ index: 0, candidates: [5] }] }),
      /^Two rows \(or columns\) have the candidate 5 in only two positions/,
    ],
    [
      step('TwoStringKite', { cause: [{ index: 0, candidates: [7] }] }),
      /exactly two positions for candidate 7/,
    ],
    [
      step('UniqueRectangleType1', {
        eliminations: [{ index: 10, value: 2 }],
        cause: [{ index: 0, candidates: [2, 8] }],
      }),
      /candidates \{2, 8\} spans two boxes.*removed from cell R2C2/,
    ],
    [
      step('W-Wing', {
        eliminations: [{ index: 20, value: 5 }],
        cause: [{ index: 0, candidates: [5, 9] }],
      }),
      /^Two cells hold the identical pair \{5, 9\}/,
    ],
    [
      step('W-Wing', {
        eliminations: [{ index: 20, value: 5 }],
        cause: [{ index: 0, candidates: [5] }],
      }),
      /identical pair \{5, 0\}/,
    ],
    [step('Backtracking'), /A backtracking \(brute-force\) search found the solution\./],
    [step('Magic'), /^Technique used: Magic\.$/],
  ]

  it.each(cases)('explains %o', (s, expected) => {
    expect(getStepExplanation(s)).toMatch(expected)
  })

  it('never uses a semicolon', () => {
    for (const [s] of cases) {
      expect(getStepExplanation(s)).not.toContain(';')
    }
  })
})

describe('getHintExplanation', () => {
  it('points at a wrong cell', () => {
    expect(getHintExplanation({ kind: 'mistake', index: 12 })).toBe(
      'Cell R2C4 does not match the solution. Erase it before looking further.',
    )
  })

  it('reveals a cell when logic is stuck', () => {
    expect(getHintExplanation({ kind: 'reveal', index: 80, value: 4 })).toBe(
      'No logical technique applies here. Cell R9C9 is 4.',
    )
  })

  it('explains a logical step', () => {
    const s = step('NakedSingle', { placements: [{ index: 0, value: 5 }] })
    expect(getHintExplanation({ kind: 'step', step: s })).toBe(getStepExplanation(s))
  })
})
