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

import { TECHNIQUES } from '../core/game/steps'
import { CORPUS, parseCorpus } from './corpus'

const PUZZLE = `${'.'.repeat(80)}1`

describe('parseCorpus', () => {
  it('reads each puzzle with its placements, eliminations and causes', () => {
    const text = [
      `PUZZLE ${PUZZLE}`,
      'HiddenSingle p 4=1 e 58=1 4=2 c',
      'XyzWing p e 60=3 c 78=[2, 3, 8] 33=[3, 8]',
      '',
      `PUZZLE ${PUZZLE}`,
      'NakedSingle p 0=9 e c 1=[]',
      '',
    ].join('\n')
    expect(parseCorpus(text)).toEqual([
      {
        puzzle: PUZZLE,
        steps: [
          {
            technique: 'HiddenSingle',
            placements: [{ index: 4, digit: 1 }],
            eliminations: [
              { index: 58, digit: 1 },
              { index: 4, digit: 2 },
            ],
            cause: [],
          },
          {
            technique: 'XYZ-Wing',
            placements: [],
            eliminations: [{ index: 60, digit: 3 }],
            cause: [
              { index: 78, candidates: 0b10000110 },
              { index: 33, candidates: 0b10000100 },
            ],
          },
        ],
      },
      {
        puzzle: PUZZLE,
        steps: [
          {
            technique: 'NakedSingle',
            placements: [{ index: 0, digit: 9 }],
            eliminations: [],
            cause: [{ index: 1, candidates: 0 }],
          },
        ],
      },
    ])
  })

  it.each([
    ['an unknown technique', 'Guess p e c', 'unknown technique Guess'],
    ['a cell off the board', 'NakedSingle p 81=1 e c', 'cell 81 is off the board'],
    ['a digit out of range', 'NakedSingle p 0=0 e c', '0 is no digit'],
    ['a line that is no step', 'NakedSingle', 'no step in "NakedSingle"'],
  ])('refuses %s', (_, line, message) => {
    expect(() => parseCorpus(`PUZZLE ${PUZZLE}\n${line}`)).toThrow(message)
  })

  it('refuses a step before any puzzle', () => {
    expect(() => parseCorpus('NakedSingle p 0=1 e c')).toThrow('a step before any puzzle')
  })
})

describe('the golden corpus', () => {
  it('holds every technique the solver emits, which backtracking is not', () => {
    expect(CORPUS).toHaveLength(11)
    const seen = new Set(CORPUS.flatMap(({ steps }) => steps.map((step) => step.technique)))
    expect(seen).toEqual(new Set(TECHNIQUES.filter((technique) => technique !== 'Backtracking')))
  })
})
