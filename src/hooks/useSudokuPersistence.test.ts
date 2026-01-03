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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { initialState, STORAGE_KEYS } from '@/context/sudoku.reducer'
import type { SudokuState } from '@/context/sudoku.types'

import { useSudokuPersistence } from './useSudokuPersistence'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    clear: () => {
      store = {}
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    length: 0,
    key: () => null,
  }
})()

describe('useSudokuPersistence', () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let originalLocalStorage: any

  beforeAll(() => {
    // Overwrite localStorage to avoid polluting the global scope
    originalLocalStorage = window.localStorage
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
      writable: true,
    })
  })

  afterAll(() => {
    // Restore original localStorage
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      configurable: true,
      writable: true,
    })
  })

  beforeEach(() => {
    localStorageMock.clear()
    setItemSpy = vi.spyOn(localStorageMock, 'setItem')
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    setItemSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  it('should save to all split keys on first render', () => {
    renderHook(() => useSudokuPersistence(initialState))
    // Expect separate calls for GAME, METRICS, and POOL
    expect(setItemSpy).toHaveBeenCalledTimes(3)
    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEYS.GAME, expect.any(String))
    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEYS.METRICS, expect.any(String))
    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEYS.POOL, expect.any(String))
  })

  it('should save only GAME state when history changes', () => {
    const updatedState: SudokuState = {
      ...initialState,
      history: {
        stack: [...initialState.history.stack, initialState.board],
        index: 1,
      },
    }

    const { rerender } = renderHook((props) => useSudokuPersistence(props), {
      initialProps: initialState,
    })

    setItemSpy.mockClear()
    rerender(updatedState)

    // Should ONLY save GAME, not metrics or pool
    expect(setItemSpy).toHaveBeenCalledTimes(1)
    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEYS.GAME, expect.any(String))
  })

  it('should save only METRICS when timer changes', () => {
    const updatedState: SudokuState = {
      ...initialState,
      game: { timer: 5, mistakes: 1 },
    }

    const { rerender } = renderHook((props) => useSudokuPersistence(props), {
      initialProps: initialState,
    })

    setItemSpy.mockClear()
    rerender(updatedState)

    // Should ONLY save METRICS
    expect(setItemSpy).toHaveBeenCalledTimes(1)
    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEYS.METRICS, expect.any(String))
  })

  it('should save only POOL when puzzle pool changes', () => {
    const updatedState: SudokuState = {
      ...initialState,
      puzzlePool: {
        ...initialState.puzzlePool,
        easy: [{ puzzleString: 'abc', solutionString: 'def' }],
      },
    }

    const { rerender } = renderHook((props) => useSudokuPersistence(props), {
      initialProps: initialState,
    })

    setItemSpy.mockClear()
    rerender(updatedState)

    // Should ONLY save POOL
    expect(setItemSpy).toHaveBeenCalledTimes(1)
    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEYS.POOL, expect.any(String))
  })

  it('should not save if irrelevant props change', () => {
    const updatedState: SudokuState = {
      ...initialState,
      solver: { ...initialState.solver, isSolving: true }, // This prop isn't in any deps array
    }

    const { rerender } = renderHook((props) => useSudokuPersistence(props), {
      initialProps: initialState,
    })

    setItemSpy.mockClear()
    rerender(updatedState)

    expect(setItemSpy).not.toHaveBeenCalled()
  })

  it('should handle local storage write errors gracefully', () => {
    setItemSpy.mockImplementation(() => {
      throw new Error('Storage is full')
    })

    renderHook(() => useSudokuPersistence(initialState))

    // Expect error logs for each failed save attempt
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save'),
      expect.any(Error),
    )
  })
})
