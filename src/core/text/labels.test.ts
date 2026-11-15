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

import {
  CUSTOM_NAME,
  DIFFICULTY_NAMES,
  difficultyName,
  mistakeAnnouncement,
  mistakeCount,
  SOLVE_TITLES,
  winSummary,
} from './labels'

describe('labels', () => {
  it('names each difficulty, and a custom puzzle without one', () => {
    expect(difficultyName('expert')).toBe(DIFFICULTY_NAMES.expert)
    expect(difficultyName(null)).toBe(CUSTOM_NAME)
  })

  it('counts mistakes in the singular and the plural', () => {
    expect(mistakeCount(1)).toBe('1 mistake')
    expect(mistakeCount(0)).toBe('0 mistakes')
    expect(mistakeCount(2)).toBe('2 mistakes')
    expect(mistakeAnnouncement(1)).toBe('1 mistake so far.')
  })

  it('says what the win took, as the old dialog did', () => {
    expect(winSummary('easy', 754, 1)).toBe('Easy puzzle finished in 12:34 with 1 mistake.')
    expect(winSummary(null, 5, 0)).toBe('Custom puzzle finished in 00:05 with 0 mistakes.')
  })

  it('keeps the old titles of the solve button', () => {
    expect(SOLVE_TITLES.conflicts).toBe('Cannot solve with conflicts.')
  })
})
