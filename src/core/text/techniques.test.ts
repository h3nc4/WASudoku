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

import type { CellIndex, Digit } from '../digits'
import { maskOf } from '../digits'
import { BACKTRACKING_STEP, type Step, type Technique, TECHNIQUES } from '../game/steps'
import {
  explainPosition,
  explainStep,
  solvedInText,
  traceText,
  WALKTHROUGH_START,
} from './techniques'

const at = (index: number) => index as CellIndex
const empty = (technique: Technique): Step => ({ ...BACKTRACKING_STEP, technique })

const single: Step = {
  technique: 'NakedSingle',
  placements: [{ index: at(0), digit: 5 }],
  eliminations: [{ index: at(1), digit: 5 }],
  cause: [],
}

const pointing = (cells: number[]): Step => ({
  technique: 'PointingPair',
  placements: [],
  eliminations: [{ index: at(60), digit: 3 }],
  cause: cells.map((index) => ({ index: at(index), candidates: maskOf([3]) })),
})

describe('step text', () => {
  it.each(TECHNIQUES.filter((t) => t !== 'Backtracking'))(
    'names %s alone when the step lacks the cells its sentence needs',
    (technique) => {
      expect(explainStep(empty(technique))).toMatch(/^[\w -]+\.$/)
    },
  )

  it('names a wing alone when one pincer is missing', () => {
    const wing: Step = {
      technique: 'XY-Wing',
      placements: [],
      eliminations: [{ index: at(4), digit: 2 }],
      cause: [{ index: at(0), candidates: maskOf([1, 2]) }],
    }
    expect(explainStep(wing)).toBe('XY-Wing.')
  })

  it('names a box-line pattern alone when its cause holds no digit', () => {
    expect(explainStep({ ...pointing([0, 1]), cause: [{ index: at(0), candidates: 0 }] })).toBe(
      'Pointing Pair.',
    )
  })

  it('names the column of a vertical pattern and the row otherwise', () => {
    expect(explainStep(pointing([0, 9]))).toContain('which lie in column 1')
    expect(explainStep(pointing([0, 1]))).toContain('which lie in row 1')
    expect(explainStep(pointing([0]))).toContain('which lie in row 1')
  })

  it('needs no unique rectangle elimination to stay silent on a missing cause', () => {
    const rectangle: Step = { ...empty('UniqueRectangleType1'), eliminations: single.eliminations }
    expect(explainStep(rectangle)).toBe('Unique Rectangle Type 1.')
  })

  it('reads a W-Wing whose pair holds only the struck digit', () => {
    const wWing: Step = {
      technique: 'W-Wing',
      placements: [],
      eliminations: [{ index: at(2), digit: 4 }],
      cause: [{ index: at(0), candidates: maskOf([4]) }],
    }
    expect(explainStep(wWing)).toBe(
      'Two cells hold only 4 but do not see each other. A strong link connects them, which forces one of the two cells to be 4. So 4 is removed from any cell that sees both.',
    )
    const order = (digits: Digit[]) =>
      explainStep({ ...wWing, cause: [{ index: at(0), candidates: maskOf(digits) }] })
    expect(order([9, 4])).toBe(order([4, 9]))
    expect(explainStep({ ...wWing, cause: [] })).toContain('A strong link connects them')
  })
})

describe('trace text', () => {
  it('points at the placement with its digit, or without it for a hint', () => {
    expect(traceText(single)).toEqual({ where: 'R1C1 = 5', label: 'Naked Single' })
    expect(traceText(single, false)).toEqual({ where: 'R1C1', label: 'Naked Single' })
  })

  it('points at the pattern, then at the struck cells, then nowhere', () => {
    expect(traceText(pointing([0, 1, 2])).where).toBe('R1C1 +2')
    expect(traceText({ ...pointing([]), cause: [] }).where).toBe('R7C7')
    expect(traceText(BACKTRACKING_STEP)).toEqual({ where: '', label: 'Backtracking' })
  })
})

describe('walkthrough text', () => {
  it('explains the position on the board, 0 being the puzzle as given', () => {
    expect(explainPosition([single], 0)).toBe(WALKTHROUGH_START)
    expect(explainPosition([single], 1)).toBe(explainStep(single))
    expect(explainPosition([single], 2)).toBe(WALKTHROUGH_START)
  })

  it('counts the steps in the plural form', () => {
    expect(solvedInText(1)).toBe('Solved in 1 step')
    expect(solvedInText(3)).toBe('Solved in 3 steps')
  })
})
