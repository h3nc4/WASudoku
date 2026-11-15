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

import { figureRows } from './figure'

describe('figureRows', () => {
  it('keeps what the board draws and drops the live grid attributes', () => {
    const rows = figureRows([{ value: 5, given: true, selected: true }, { cause: true }])
    expect(rows).toHaveLength(9)
    const [first, second] = rows[0] ?? []
    expect(first?.value).toBe(5)
    expect(first?.attributes).toEqual({ 'aria-readonly': 'true' })
    expect(second?.attributes).toEqual({ 'data-cause': '' })
  })
})
