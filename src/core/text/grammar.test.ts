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

import { EN } from './grammar'

describe('English grammar', () => {
  it('joins lists without a serial comma', () => {
    expect(EN.and([])).toBe('')
    expect(EN.and(['1'])).toBe('1')
    expect(EN.and(['1', '2'])).toBe('1 and 2')
    expect(EN.or(['1', '2', '3'])).toBe('1, 2 or 3')
  })

  it('picks the plural form', () => {
    expect(EN.plural(1)).toBe('one')
    expect(EN.plural(0)).toBe('other')
    expect(EN.plural(2)).toBe('other')
  })
})
