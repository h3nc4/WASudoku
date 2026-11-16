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

import { byCodeUnit } from './order'

describe('byCodeUnit', () => {
  it('orders by code unit, upper case before lower and digits first', () => {
    const words = ['b', 'a-b', 'B', 'ab', '10', '9', 'a']
    expect([...words].sort(byCodeUnit)).toEqual(['10', '9', 'B', 'a', 'a-b', 'ab', 'b'])
  })

  it('treats equal strings as equal', () => {
    expect(byCodeUnit('a', 'a')).toBe(0)
  })
})
