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

import { makeState } from '@/test/sudoku-state'

import { CONFLICT_PULSE_MS, useSudokuFeedback } from './useSudokuFeedback'

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
    vi.unstubAllGlobals()
  })

  it('does not show a toast or dispatch when there is no error', () => {
    const state = makeState({ ui: { lastError: null } })
    renderHook(() => useSudokuFeedback(state, mockDispatch))
    expect(toast.error).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('shows a toast and dispatches clearError when an error is present', () => {
    const errorMessage = 'Invalid move'
    const state = makeState({ ui: { lastError: errorMessage } })
    const { rerender } = renderHook((props) => useSudokuFeedback(props.state, props.dispatch), {
      initialProps: { state, dispatch: mockDispatch },
    })

    expect(toast.error).toHaveBeenCalledWith(errorMessage)
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLEAR_ERROR' })

    const clearedState = makeState({ ui: { lastError: null } }, state)
    rerender({ state: clearedState, dispatch: mockDispatch })

    expect(toast.error).toHaveBeenCalledOnce()
    expect(mockDispatch).toHaveBeenCalledOnce()
  })

  it('clears transient conflicts when the 600ms pulse ends', () => {
    const state = makeState({ ui: { transientConflicts: new Set([1, 2]) } })
    renderHook(() => useSudokuFeedback(state, mockDispatch))

    expect(CONFLICT_PULSE_MS).toBe(600)
    act(() => {
      vi.advanceTimersByTime(CONFLICT_PULSE_MS - 1)
    })
    expect(mockDispatch).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(mockDispatch).toHaveBeenCalledExactlyOnceWith({ type: 'CLEAR_TRANSIENT_CONFLICTS' })
  })

  it('holds the reduced-motion outline for the same 600ms', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query.includes('reduce') })),
    )
    const state = makeState({ ui: { transientConflicts: new Set([4]) } })
    renderHook(() => useSudokuFeedback(state, mockDispatch))

    act(() => {
      vi.advanceTimersByTime(CONFLICT_PULSE_MS - 1)
    })
    expect(mockDispatch).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(mockDispatch).toHaveBeenCalledExactlyOnceWith({ type: 'CLEAR_TRANSIENT_CONFLICTS' })
  })

  it('restarts the pulse window when a new clash replaces the last one', () => {
    const first = makeState({ ui: { transientConflicts: new Set([1]) } })
    const { rerender } = renderHook((props) => useSudokuFeedback(props.state, mockDispatch), {
      initialProps: { state: first },
    })

    act(() => {
      vi.advanceTimersByTime(400)
    })
    rerender({ state: makeState({ ui: { transientConflicts: new Set([2]) } }, first) })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(mockDispatch).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(mockDispatch).toHaveBeenCalledExactlyOnceWith({ type: 'CLEAR_TRANSIENT_CONFLICTS' })
  })
})
