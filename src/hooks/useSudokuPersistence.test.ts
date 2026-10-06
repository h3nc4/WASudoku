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
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

import { GAME_FORMAT_VERSION, STORAGE_KEYS } from '@/context/sudoku.persistence'
import { initialState } from '@/context/sudoku.reducer'
import type { SudokuState } from '@/context/sudoku.types'
import { makeState } from '@/test/sudoku-state'

import { useSudokuPersistence } from './useSudokuPersistence'

const withMove = (state: SudokuState): SudokuState => ({
  ...state,
  history: { stack: [...state.history.stack, state.board], index: state.history.stack.length },
})

const storedGame = () => JSON.parse(globalThis.localStorage.getItem(STORAGE_KEYS.GAME) ?? 'null')

const setVisibility = (value: DocumentVisibilityState) =>
  Object.defineProperty(document, 'visibilityState', { value, configurable: true })

describe('useSudokuPersistence', () => {
  let setItemSpy: MockInstance<Storage['setItem']>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    globalThis.localStorage.clear()
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    setItemSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    setVisibility('visible')
  })

  const keysWritten = () => setItemSpy.mock.calls.map(([key]) => key)

  const renderPersistence = () => {
    const view = renderHook((props) => useSudokuPersistence(props), { initialProps: initialState })
    vi.runAllTimers()
    setItemSpy.mockClear()
    return view
  }

  it('saves metrics and pool at once and the game once idle', () => {
    renderHook(() => useSudokuPersistence(initialState))
    expect(keysWritten()).toEqual([STORAGE_KEYS.METRICS, STORAGE_KEYS.POOL])

    vi.runAllTimers()
    expect(keysWritten()).toEqual([STORAGE_KEYS.METRICS, STORAGE_KEYS.POOL, STORAGE_KEYS.GAME])
    expect(storedGame().version).toBe(GAME_FORMAT_VERSION)
  })

  it('coalesces several moves into one write of the latest history', () => {
    const { rerender } = renderPersistence()
    const once = withMove(initialState)
    const twice = withMove(once)

    rerender(once)
    rerender(twice)
    expect(setItemSpy).not.toHaveBeenCalled()

    vi.runAllTimers()
    expect(keysWritten()).toEqual([STORAGE_KEYS.GAME])
    expect(storedGame().history.index).toBe(2)
  })

  it('saves the puzzle difficulty with the game', () => {
    const { rerender } = renderPersistence()
    rerender(makeState({ solver: { difficulty: 'expert' } }))
    vi.runAllTimers()
    expect(storedGame().difficulty).toBe('expert')
  })

  it('flushes a pending game on pagehide', () => {
    const { rerender } = renderPersistence()
    rerender(withMove(initialState))

    globalThis.dispatchEvent(new Event('pagehide'))
    expect(keysWritten()).toEqual([STORAGE_KEYS.GAME])
    expect(storedGame().history.index).toBe(1)

    vi.runAllTimers()
    expect(keysWritten()).toEqual([STORAGE_KEYS.GAME])
  })

  it('flushes a pending game when the page turns hidden but not when visible', () => {
    const { rerender } = renderPersistence()
    rerender(withMove(initialState))

    document.dispatchEvent(new Event('visibilitychange'))
    expect(setItemSpy).not.toHaveBeenCalled()

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(keysWritten()).toEqual([STORAGE_KEYS.GAME])
  })

  it('does nothing on hide when nothing is pending', () => {
    renderPersistence()
    globalThis.dispatchEvent(new Event('pagehide'))
    expect(setItemSpy).not.toHaveBeenCalled()
  })

  it('flushes a pending game on unmount and stops listening', () => {
    const { rerender, unmount } = renderPersistence()
    rerender(withMove(initialState))

    unmount()
    expect(keysWritten()).toEqual([STORAGE_KEYS.GAME])

    globalThis.dispatchEvent(new Event('pagehide'))
    vi.runAllTimers()
    expect(keysWritten()).toEqual([STORAGE_KEYS.GAME])
  })

  it('saves only metrics when the timer changes', () => {
    const { rerender } = renderPersistence()
    rerender(makeState({ game: { timer: 5, mistakes: 1 } }))
    vi.runAllTimers()
    expect(keysWritten()).toEqual([STORAGE_KEYS.METRICS])
  })

  it('saves only the pool when the puzzle pool changes', () => {
    const { rerender } = renderPersistence()
    rerender(
      makeState({
        puzzlePool: {
          ...initialState.puzzlePool,
          easy: [{ puzzleString: 'a', solutionString: 'b' }],
        },
      }),
    )
    vi.runAllTimers()
    expect(keysWritten()).toEqual([STORAGE_KEYS.POOL])
  })

  it('does not save when unrelated state changes', () => {
    const { rerender } = renderPersistence()
    rerender(makeState({ solver: { isSolving: true } }))
    vi.runAllTimers()
    expect(setItemSpy).not.toHaveBeenCalled()
  })

  it('logs storage write errors instead of throwing', () => {
    setItemSpy.mockImplementation(() => {
      throw new Error('Storage is full')
    })
    renderHook(() => useSudokuPersistence(initialState))
    vi.runAllTimers()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Failed to save ${STORAGE_KEYS.GAME} to local storage:`,
      expect.any(Error),
    )
  })
})
