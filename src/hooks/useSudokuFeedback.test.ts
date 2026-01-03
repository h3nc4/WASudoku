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

import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { initialState } from '@/context/sudoku.reducer'
import type { SudokuState } from '@/context/sudoku.types'

import { useSudokuFeedback } from './useSudokuFeedback'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

describe('useSudokuFeedback', () => {
  const mockDispatch = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not show a toast or dispatch when there is no error', () => {
    const state: SudokuState = {
      ...initialState,
      ui: { ...initialState.ui, lastError: null },
    }
    renderHook(() => useSudokuFeedback(state, mockDispatch))
    expect(toast.error).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('shows a toast and dispatches clearError when an error is present', () => {
    const errorMessage = 'Invalid move'
    const state: SudokuState = {
      ...initialState,
      ui: { ...initialState.ui, lastError: errorMessage },
    }
    const { rerender } = renderHook((props) => useSudokuFeedback(props.state, props.dispatch), {
      initialProps: { state, dispatch: mockDispatch },
    })

    expect(toast.error).toHaveBeenCalledWith(errorMessage)
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLEAR_ERROR' })

    const clearedState: SudokuState = {
      ...state,
      ui: { ...state.ui, lastError: null },
    }
    rerender({ state: clearedState, dispatch: mockDispatch })

    expect(toast.error).toHaveBeenCalledOnce()
    expect(mockDispatch).toHaveBeenCalledOnce()
  })

  it('dispatches clearTransientConflicts after 1 second when transientConflicts is present', () => {
    const conflicts = new Set([1, 2])
    const state: SudokuState = {
      ...initialState,
      ui: { ...initialState.ui, transientConflicts: conflicts },
    }

    renderHook(() => useSudokuFeedback(state, mockDispatch))

    expect(mockDispatch).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLEAR_TRANSIENT_CONFLICTS' })
  })
})
