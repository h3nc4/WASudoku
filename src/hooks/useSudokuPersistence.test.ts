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

import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { useSudokuPersistence } from './useSudokuPersistence'
import type { SudokuState } from '@/context/sudoku.types'
import { initialState } from '@/context/sudoku.reducer'

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

  it('should save the initial state to local storage on first render', () => {
    renderHook(() => useSudokuPersistence(initialState))
    expect(setItemSpy).toHaveBeenCalledOnce()
    expect(setItemSpy).toHaveBeenCalledWith('wasudoku-game-state', expect.any(String))
    const savedData = JSON.parse(setItemSpy.mock.calls[0][1] as string)
    expect(savedData.history.index).toBe(0)
    expect(savedData.history.stack).toHaveLength(1)
    expect(savedData.game.timer).toBe(0)
  })

  it('should save state to local storage when history changes', () => {
    const updatedState: SudokuState = {
      ...initialState,
      history: {
        stack: [...initialState.history.stack, initialState.board], // Simulate adding a new state
        index: 1,
      },
    }

    const { rerender } = renderHook((props) => useSudokuPersistence(props), {
      initialProps: initialState,
    })

    expect(setItemSpy).toHaveBeenCalledTimes(1)

    rerender(updatedState)

    expect(setItemSpy).toHaveBeenCalledTimes(2)
    const savedData = JSON.parse(setItemSpy.mock.calls[1][1] as string)
    expect(savedData.history.index).toBe(1)
    expect(savedData.history.stack).toHaveLength(2)
  })

  it('should save state to local storage when game metrics change', () => {
    const updatedState: SudokuState = {
      ...initialState,
      game: { timer: 5, mistakes: 1 },
    }

    const { rerender } = renderHook((props) => useSudokuPersistence(props), {
      initialProps: initialState,
    })

    expect(setItemSpy).toHaveBeenCalledTimes(1)

    rerender(updatedState)

    expect(setItemSpy).toHaveBeenCalledTimes(2)
    const savedData = JSON.parse(setItemSpy.mock.calls[1][1] as string)
    expect(savedData.game.timer).toBe(5)
    expect(savedData.game.mistakes).toBe(1)
  })

  it('should not save state if only irrelevant props change', () => {
    const updatedState: SudokuState = {
      ...initialState,
      solver: { ...initialState.solver, isSolving: true }, // This prop change should not trigger a save
    }

    const { rerender } = renderHook((props) => useSudokuPersistence(props), {
      initialProps: initialState,
    })

    expect(setItemSpy).toHaveBeenCalledTimes(1)

    rerender(updatedState)

    // Should not have been called again
    expect(setItemSpy).toHaveBeenCalledTimes(1)
  })

  it('should handle local storage write errors gracefully', () => {
    setItemSpy.mockImplementation(() => {
      throw new Error('Storage is full')
    })

    renderHook(() => useSudokuPersistence(initialState))

    expect(setItemSpy).toThrow('Storage is full')
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to save game state to local storage:',
      expect.any(Error),
    )
  })
})
