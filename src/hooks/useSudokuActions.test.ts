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
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import * as actionCreators from '@/context/sudoku.actions'
import { useSudokuDispatch, useSudokuState } from '@/context/sudoku.hooks'
import { initialState } from '@/context/sudoku.reducer'
import { SudokuProvider } from '@/context/SudokuProvider'
import { mockSudoku } from '@/test/sudoku-state'

import { useSudokuActions } from './useSudokuActions'

// Only dispatch is replaced, so a hook that reads state still sees the real provider.
vi.mock('@/context/sudoku.hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/context/sudoku.hooks')>()
  return { ...actual, useSudokuDispatch: vi.fn(actual.useSudokuDispatch) }
})
vi.mock('@/hooks/useSudokuPersistence')
vi.mock('@/hooks/useSudokuSolver')
vi.mock('@/hooks/useSudokuFeedback')
vi.mock('@/hooks/useGameTimer')
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('useSudokuActions', () => {
  const mockDispatch = vi.fn()

  const mockClipboard = {
    writeText: vi.fn(),
    readText: vi.fn(),
  }

  beforeAll(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      configurable: true,
    })
  })

  afterAll(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockClipboard.writeText.mockResolvedValue(undefined)
    mockSudoku({ dispatch: mockDispatch })
  })

  // Helper to get the current actions from the hook
  const getActions = () => {
    const { result } = renderHook(() => useSudokuActions())
    return result.current
  }

  describe('exportBoard', () => {
    it('calls clipboard.writeText with the correct board string and shows toast', async () => {
      const boardWithValues = initialState.board.map((cell, index) => {
        if (index === 0) return { ...cell, value: 5 }
        if (index === 80) return { ...cell, value: 9 }
        return cell
      })
      const actions = getActions()
      await act(async () => {
        actions.exportBoard(boardWithValues)
      })
      const expectedString = '5' + '.'.repeat(79) + '9'
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expectedString)
      expect(toast.success).toHaveBeenCalledWith('Board exported to clipboard.')
    })

    it('shows an error toast if clipboard write fails', async () => {
      mockClipboard.writeText.mockRejectedValue(new Error('Write failed'))
      const actions = getActions()
      await act(async () => {
        actions.exportBoard(initialState.board)
      })
      expect(toast.error).toHaveBeenCalledWith('Failed to copy to clipboard.')
    })

    it('shows an error toast if clipboard API is not available', async () => {
      const originalClipboard = navigator.clipboard
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        configurable: true,
      })

      const actions = getActions()
      await act(async () => {
        actions.exportBoard(initialState.board)
      })
      expect(toast.error).toHaveBeenCalledWith(
        'Clipboard API not available in this browser or context.',
      )
      Object.defineProperty(navigator, 'clipboard', { value: originalClipboard })
    })
  })

  describe('sharePuzzleLink', () => {
    it('copies a link carrying the puzzle it is given', async () => {
      const puzzle = initialState.board.map((cell, index) =>
        index === 0 ? { ...cell, value: 5, isGiven: true } : cell,
      )
      const actions = getActions()
      await act(async () => {
        actions.sharePuzzleLink(puzzle)
      })
      const url = new URL(mockClipboard.writeText.mock.calls[0][0])
      expect(url.origin + url.pathname).toBe(
        globalThis.location.origin + globalThis.location.pathname,
      )
      expect(url.searchParams.get('p')).toBe('5' + '.'.repeat(80))
      expect(toast.success).toHaveBeenCalledWith('Puzzle link copied to clipboard.')
    })
  })

  describe('Direct Actions', () => {
    it.each([
      ['requestHint', actionCreators.requestHint()],
      ['clearHint', actionCreators.clearHint()],
      ['pauseGame', actionCreators.pauseGame()],
      ['resumeGame', actionCreators.resumeGame()],
      ['dismissPuzzle', actionCreators.dismissPuzzle()],
      ['cycleInputMode', actionCreators.cycleInputMode()],
      ['toggleSticky', actionCreators.toggleSticky()],
    ] as const)('%s dispatches its action', (name, expected) => {
      const actions = getActions()
      act(() => actions[name]())
      expect(mockDispatch).toHaveBeenCalledWith(expected)
    })

    it('offerPuzzle and loadPuzzle carry the puzzle string', () => {
      const actions = getActions()
      const puzzle = '.'.repeat(81)
      act(() => actions.offerPuzzle(puzzle))
      act(() => actions.loadPuzzle(puzzle))
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.offerPuzzle(puzzle))
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.loadPuzzle(puzzle))
    })

    it('passes the intents that read state on to the reducer', () => {
      const actions = getActions()
      act(() => actions.inputValue(5))
      act(() => actions.navigate('left'))
      act(() => actions.eraseActiveCell('backspace'))
      act(() => actions.stepVisualization(-1))
      act(() => actions.setStickyValue(3))
      act(() => actions.tapCell(40))
      expect(mockDispatch.mock.calls).toEqual([
        [actionCreators.inputValue(5)],
        [actionCreators.navigate('left')],
        [actionCreators.eraseActiveCell('backspace')],
        [actionCreators.stepVisualization(-1)],
        [actionCreators.setStickyValue(3)],
        [actionCreators.tapCell(40)],
      ])
    })

    it('setActiveCell dispatches SET_ACTIVE_CELL', () => {
      const actions = getActions()
      act(() => actions.setActiveCell(10))
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.setActiveCell(10))
    })

    it('clearBoard dispatches CLEAR_BOARD', () => {
      const actions = getActions()
      act(() => actions.clearBoard())
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.clearBoard())
    })

    it('autoFillCandidates dispatches AUTO_FILL_CANDIDATES', () => {
      const actions = getActions()
      act(() => actions.autoFillCandidates())
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.autoFillCandidates())
    })

    it('undo dispatches UNDO', () => {
      const actions = getActions()
      act(() => actions.undo())
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.undo())
    })

    it('redo dispatches REDO', () => {
      const actions = getActions()
      act(() => actions.redo())
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.redo())
    })

    it('solve dispatches SOLVE_START', () => {
      const actions = getActions()
      act(() => actions.solve())
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.solveStart())
    })

    it('generatePuzzle dispatches GENERATE_PUZZLE_START', () => {
      const actions = getActions()
      act(() => actions.generatePuzzle('easy'))
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.generatePuzzleStart('easy'))
    })

    it('validatePuzzle dispatches VALIDATE_PUZZLE_START', () => {
      const actions = getActions()
      act(() => actions.validatePuzzle())
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.validatePuzzleStart())
    })

    it('startCustomPuzzle dispatches START_CUSTOM_PUZZLE', () => {
      const actions = getActions()
      act(() => actions.startCustomPuzzle())
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.startCustomPuzzle())
    })

    it('exitVisualization dispatches EXIT_VISUALIZATION', () => {
      const actions = getActions()
      act(() => actions.exitVisualization())
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.exitVisualization())
    })

    it('setInputMode dispatches SET_INPUT_MODE', () => {
      const actions = getActions()
      act(() => actions.setInputMode('candidate'))
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.setInputMode('candidate'))
    })

    it('setHighlightedValue dispatches SET_HIGHLIGHTED_VALUE', () => {
      const actions = getActions()
      act(() => actions.setHighlightedValue(5))
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.setHighlightedValue(5))
    })

    it('viewSolverStep dispatches VIEW_SOLVER_STEP', () => {
      const actions = getActions()
      act(() => actions.viewSolverStep(3))
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.viewSolverStep(3))
    })
  })

  describe('identity', () => {
    it('keeps the same actions object across a timer tick', async () => {
      const actual =
        await vi.importActual<typeof import('@/context/sudoku.hooks')>('@/context/sudoku.hooks')
      vi.mocked(useSudokuDispatch).mockImplementation(actual.useSudokuDispatch)
      const { result } = renderHook(
        () => ({
          actions: useSudokuActions(),
          dispatch: useSudokuDispatch(),
          timer: useSudokuState().game.timer,
        }),
        { wrapper: SudokuProvider },
      )
      const before = result.current.actions

      act(() => result.current.dispatch(actionCreators.tickTimer()))

      expect(result.current.timer).toBe(1)
      expect(result.current.actions).toBe(before)
    })
  })
})
