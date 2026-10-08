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

import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { offerPuzzle } from '@/context/sudoku.actions'

import { useSharedPuzzleLink } from './useSharedPuzzleLink'

describe('useSharedPuzzleLink', () => {
  const puzzle = '5'.repeat(81)

  afterEach(() => {
    globalThis.history.replaceState(null, '', '/')
  })

  it('offers the linked puzzle once and removes it from the address', () => {
    globalThis.history.replaceState(null, '', `/play/?p=${puzzle}&keep=1`)
    const dispatch = vi.fn()

    const { rerender } = renderHook(() => useSharedPuzzleLink(dispatch))
    rerender()

    expect(dispatch).toHaveBeenCalledExactlyOnceWith(offerPuzzle(puzzle))
    expect(globalThis.location.pathname).toBe('/play/')
    expect(globalThis.location.search).toBe('?keep=1')
  })

  it('does nothing without a valid puzzle', () => {
    globalThis.history.replaceState(null, '', '/?p=nope')
    const dispatch = vi.fn()

    renderHook(() => useSharedPuzzleLink(dispatch))

    expect(dispatch).not.toHaveBeenCalled()
    expect(globalThis.location.search).toBe('?p=nope')
  })
})
