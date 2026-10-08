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
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SudokuState } from '@/context/sudoku.types'
import { makeState, mockSudoku } from '@/test/sudoku-state'

import { useKeyboardShortcuts } from './useKeyboardShortcuts'

vi.mock('@/context/sudoku.hooks')
vi.mock('./useSudokuActions')

const press = (key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init })
  globalThis.dispatchEvent(event)
  return event
}

describe('useKeyboardShortcuts', () => {
  const actions = { undo: vi.fn(), redo: vi.fn(), stepVisualization: vi.fn() }
  const playing = makeState({ solver: { gameMode: 'playing' } })

  beforeEach(() => {
    vi.clearAllMocks()
    mockSudoku({ state: playing, actions })
  })

  it('undoes on Ctrl+Z and Cmd+Z', () => {
    renderHook(() => useKeyboardShortcuts())
    expect(press('z', { ctrlKey: true }).defaultPrevented).toBe(true)
    press('Z', { metaKey: true })
    expect(actions.undo).toHaveBeenCalledTimes(2)
    expect(actions.redo).not.toHaveBeenCalled()
  })

  it('redoes on Ctrl+Y and Ctrl+Shift+Z', () => {
    renderHook(() => useKeyboardShortcuts())
    press('y', { ctrlKey: true })
    press('Z', { ctrlKey: true, shiftKey: true })
    expect(actions.redo).toHaveBeenCalledTimes(2)
    expect(actions.undo).not.toHaveBeenCalled()
  })

  it('leaves other modified keys and Ctrl+Alt+Z alone', () => {
    renderHook(() => useKeyboardShortcuts())
    expect(press('c', { ctrlKey: true }).defaultPrevented).toBe(false)
    press('z', { ctrlKey: true, altKey: true })
    expect(actions.undo).not.toHaveBeenCalled()
  })

  it.each([
    ['while paused', makeState({ ui: { isPaused: true } }, playing)],
    ['while solving', makeState({ solver: { isSolving: true } }, playing)],
    [
      'while validating',
      makeState({ solver: { gameMode: 'customInput', isValidating: true } }, playing),
    ],
    ['while visualizing', makeState({ solver: { gameMode: 'visualizing' } }, playing)],
  ] as [string, SudokuState][])('ignores undo %s', (_, state) => {
    mockSudoku({ state })
    renderHook(() => useKeyboardShortcuts())
    press('z', { ctrlKey: true })
    expect(actions.undo).not.toHaveBeenCalled()
  })

  it('steps through a solution with the arrow keys while visualizing', () => {
    mockSudoku({ state: makeState({ solver: { gameMode: 'visualizing' } }, playing) })
    renderHook(() => useKeyboardShortcuts())
    expect(press('ArrowLeft').defaultPrevented).toBe(true)
    press('ArrowRight')
    press('ArrowRight', { shiftKey: true })
    expect(actions.stepVisualization).toHaveBeenNthCalledWith(1, -1)
    expect(actions.stepVisualization).toHaveBeenNthCalledWith(2, 1)
    expect(actions.stepVisualization).toHaveBeenCalledTimes(2)
  })

  it('leaves other keys alone while visualizing', () => {
    mockSudoku({ state: makeState({ solver: { gameMode: 'visualizing' } }, playing) })
    renderHook(() => useKeyboardShortcuts())
    expect(press('ArrowUp').defaultPrevented).toBe(false)
    expect(actions.stepVisualization).not.toHaveBeenCalled()
  })

  it('leaves the arrow keys to the grid during play', () => {
    renderHook(() => useKeyboardShortcuts())
    expect(press('ArrowLeft').defaultPrevented).toBe(false)
    expect(actions.stepVisualization).not.toHaveBeenCalled()
  })

  it('stays out of the way while a dialog is open', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    renderHook(() => useKeyboardShortcuts())
    press('z', { ctrlKey: true })
    expect(actions.undo).not.toHaveBeenCalled()
    dialog.remove()
  })

  it('removes its listener on unmount', () => {
    const { unmount } = renderHook(() => useKeyboardShortcuts())
    unmount()
    press('z', { ctrlKey: true })
    expect(actions.undo).not.toHaveBeenCalled()
  })
})
