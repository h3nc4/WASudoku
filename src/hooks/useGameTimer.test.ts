/*
 * Copyright (C) 2025  Henrique Almeida
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

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useGameTimer } from './useGameTimer'
import { initialState } from '@/context/sudoku.reducer'
import { tickTimer } from '@/context/sudoku.actions'
import type { SudokuState } from '@/context/sudoku.types'

describe('useGameTimer', () => {
  const mockDispatch = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    mockDispatch.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should dispatch TICK_TIMER every second when in playing mode', () => {
    const playingState: SudokuState = {
      ...initialState,
      solver: { ...initialState.solver, gameMode: 'playing', isSolved: false },
    }

    renderHook(() => useGameTimer(playingState, mockDispatch))

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(mockDispatch).toHaveBeenCalledWith(tickTimer())

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(mockDispatch).toHaveBeenCalledTimes(3)
  })

  it('should not dispatch tick when not playing', () => {
    const selectingState: SudokuState = {
      ...initialState,
      solver: { ...initialState.solver, gameMode: 'selecting' },
    }

    renderHook(() => useGameTimer(selectingState, mockDispatch))

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('should stop ticking when solved', () => {
    const solvedState: SudokuState = {
      ...initialState,
      solver: { ...initialState.solver, gameMode: 'playing', isSolved: true },
    }

    renderHook(() => useGameTimer(solvedState, mockDispatch))

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(mockDispatch).not.toHaveBeenCalled()
  })
})
