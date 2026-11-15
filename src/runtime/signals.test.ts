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

import { signal } from 'alien-signals'
import { describe, expect, it } from 'vitest'

import { watch } from './signals'

describe('watch', () => {
  it('reruns on a change of what it read until disposed', () => {
    const value = signal(1)
    const seen: number[] = []
    const dispose = watch(() => {
      seen.push(value())
    })
    value(2)
    dispose()
    value(3)
    expect(seen).toEqual([1, 2])
  })
})
