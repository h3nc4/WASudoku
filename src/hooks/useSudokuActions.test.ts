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
import { afterAll, beforeAll, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import * as actionCreators from '@/context/sudoku.actions'
import { useSudokuDispatch, useSudokuState } from '@/context/sudoku.hooks'
import { initialState } from '@/context/sudoku.reducer'
import type { SudokuState } from '@/context/sudoku.types'
import { getConflictingPeers, isMoveValid } from '@/lib/utils'

import { useSudokuActions } from './useSudokuActions'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils')>()
  return {
    ...actual,
    isMoveValid: vi.fn(),
    getConflictingPeers: vi.fn(),
  }
})
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockUseSudokuState = useSudokuState as Mock
const mockUseSudokuDispatch = useSudokuDispatch as Mock
const mockIsMoveValid = vi.mocked(isMoveValid)
const mockGetConflictingPeers = vi.mocked(getConflictingPeers)

describe('useSudokuActions', () => {
  const mockDispatch = vi.fn()
  const defaultState: SudokuState = {
    ...initialState,
    solver: {
      ...initialState.solver,
      gameMode: 'playing',
    },
    ui: {
      ...initialState.ui,
      activeCellIndex: 0,
    },
  }

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
    mockUseSudokuState.mockReturnValue(defaultState)
    mockUseSudokuDispatch.mockReturnValue(mockDispatch)
    mockIsMoveValid.mockReturnValue(true) // Default to valid moves
    mockGetConflictingPeers.mockReturnValue(new Set()) // Default no conflicts
  })

  // Helper to get the current actions from the hook
  const getActions = () => {
    const { result } = renderHook(() => useSudokuActions())
    return result.current
  }

  describe('inputValue', () => {
    it('dispatches setCellValue and advances focus on a valid move in customInput mode', () => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        solver: { ...defaultState.solver, gameMode: 'customInput' },
      })
      const actions = getActions()
      act(() => actions.inputValue(5))

      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.setCellValue(0, 5))
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.setActiveCell(1))
    })

    it('stays on the cell after a valid move during play', () => {
      const actions = getActions()
      act(() => actions.inputValue(5))

      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.setCellValue(0, 5))
      expect(mockDispatch).toHaveBeenCalledTimes(1)
    })

    it('dispatches setCellValue but does not advance focus on an invalid move', () => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        solver: { ...defaultState.solver, gameMode: 'customInput' },
      })
      mockIsMoveValid.mockReturnValue(false)
      const actions = getActions()
      act(() => actions.inputValue(5))

      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.setCellValue(0, 5))
      expect(mockDispatch).not.toHaveBeenCalledWith(actionCreators.setActiveCell(1))
    })

    it('dispatches togglePencilMark in candidate mode if move is valid', () => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        ui: { ...defaultState.ui, inputMode: 'candidate' },
      })
      const actions = getActions()
      act(() => actions.inputValue(3))

      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.togglePencilMark(0, 3, 'candidate'))
    })

    it('dispatches togglePencilMark in center mode', () => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        ui: { ...defaultState.ui, inputMode: 'center' },
      })
      const actions = getActions()
      act(() => actions.inputValue(4))

      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.togglePencilMark(0, 4, 'center'))
    })

    it('dispatches setTransientConflicts in candidate mode if move is invalid (conflict)', () => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        ui: { ...defaultState.ui, inputMode: 'candidate' },
      })
      const conflicts = new Set([1, 8])
      mockGetConflictingPeers.mockReturnValue(conflicts)

      const actions = getActions()
      act(() => actions.inputValue(3))

      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.setTransientConflicts(conflicts))
      expect(mockDispatch).not.toHaveBeenCalledWith(
        actionCreators.togglePencilMark(0, 3, 'candidate'),
      )
    })

    it('always dispatches togglePencilMark if removing an existing mark, even if conflicting', () => {
      // Simulate that cell 0 already has candidate 3
      const boardWithCandidate = defaultState.board.map((c, i) =>
        i === 0 ? { ...c, candidates: new Set([3]) } : c,
      )
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        board: boardWithCandidate,
        ui: { ...defaultState.ui, inputMode: 'candidate' },
      })

      // Even if there are conflicts (simulated), removing should still work
      const conflicts = new Set([1, 8])
      mockGetConflictingPeers.mockReturnValue(conflicts)

      const actions = getActions()
      act(() => actions.inputValue(3))

      // Should toggle (remove) and NOT set transient conflicts
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.togglePencilMark(0, 3, 'candidate'))
      expect(mockDispatch).not.toHaveBeenCalledWith(actionCreators.setTransientConflicts(conflicts))
    })

    it('does not dispatch anything if no cell is active', () => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        ui: { ...defaultState.ui, activeCellIndex: null },
      })
      const actions = getActions()
      act(() => actions.inputValue(5))

      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it('does not dispatch a modification if the active cell is "given"', () => {
      const boardWithGiven = defaultState.board.map((c, i) =>
        i === 0 ? { ...c, isGiven: true } : c,
      )
      mockUseSudokuState.mockReturnValue({ ...defaultState, board: boardWithGiven })

      const actions = getActions()
      act(() => actions.inputValue(9)) // Try to change value of cell 0

      expect(mockDispatch).not.toHaveBeenCalledWith(actionCreators.setCellValue(0, 9))
      expect(mockDispatch).not.toHaveBeenCalledWith(
        actionCreators.togglePencilMark(0, 9, 'candidate'),
      )
    })
  })

  describe('navigate', () => {
    it.each([
      ['right', 0, 1],
      ['left', 1, 0],
      ['down', 0, 9],
      ['up', 9, 0],
    ])(
      'dispatches setActiveCell for direction %s from %i to %i',
      (direction, startIndex, expectedIndex) => {
        mockUseSudokuState.mockReturnValue({
          ...defaultState,
          ui: { ...defaultState.ui, activeCellIndex: startIndex },
        })
        const actions = getActions()
        act(() => actions.navigate(direction as 'right'))

        expect(mockDispatch).toHaveBeenCalledWith(actionCreators.setActiveCell(expectedIndex))
      },
    )

    it('does not dispatch if navigation is not possible', () => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        ui: { ...defaultState.ui, activeCellIndex: 80 },
      })
      const actions = getActions()
      act(() => actions.navigate('right'))

      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it('does not dispatch if no cell is active', () => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        ui: { ...defaultState.ui, activeCellIndex: null },
      })
      const actions = getActions()
      act(() => actions.navigate('right'))
      expect(mockDispatch).not.toHaveBeenCalled()
    })
  })

  describe('eraseActiveCell', () => {
    it('dispatches eraseCell and moves left for "backspace"', () => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        ui: { ...defaultState.ui, activeCellIndex: 1 },
      })
      const actions = getActions()
      act(() => actions.eraseActiveCell('backspace'))

      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.eraseCell(1))
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.setActiveCell(0))
    })

    it('dispatches eraseCell and does not move for "delete"', () => {
      const actions = getActions()
      act(() => actions.eraseActiveCell('delete'))

      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.eraseCell(0))
      expect(mockDispatch).not.toHaveBeenCalledWith(
        actionCreators.setActiveCell(expect.any(Number)),
      )
    })

    it('does not dispatch if no cell is active', () => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        ui: { ...defaultState.ui, activeCellIndex: null },
      })
      const actions = getActions()
      act(() => actions.eraseActiveCell('delete'))
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it('does not dispatch eraseCell on a "given" cell', () => {
      const boardWithGiven = defaultState.board.map((c, i) =>
        i === 0 ? { ...c, isGiven: true } : c,
      )
      mockUseSudokuState.mockReturnValue({ ...defaultState, board: boardWithGiven })

      const actions = getActions()
      act(() => actions.eraseActiveCell('delete'))

      expect(mockDispatch).not.toHaveBeenCalledWith(actionCreators.eraseCell(0))
    })

    it('navigates left on backspace from a "given" cell without erasing', () => {
      const boardWithGiven = defaultState.board.map((c, i) =>
        i === 1 ? { ...c, isGiven: true } : c,
      )
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        board: boardWithGiven,
        ui: { ...defaultState.ui, activeCellIndex: 1 },
      })

      const actions = getActions()
      act(() => actions.eraseActiveCell('backspace'))

      expect(mockDispatch).not.toHaveBeenCalledWith(actionCreators.eraseCell(1))
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.setActiveCell(0))
    })
  })

  describe('exportBoard', () => {
    it('calls clipboard.writeText with the correct board string and shows toast', async () => {
      const boardWithValues = initialState.board.map((cell, index) => {
        if (index === 0) return { ...cell, value: 5 }
        if (index === 80) return { ...cell, value: 9 }
        return cell
      })
      mockUseSudokuState.mockReturnValue({ ...defaultState, board: boardWithValues })

      const actions = getActions()
      await act(async () => {
        actions.exportBoard()
      })
      const expectedString = '5' + '.'.repeat(79) + '9'
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expectedString)
      expect(toast.success).toHaveBeenCalledWith('Board exported to clipboard.')
    })

    it('shows an error toast if clipboard write fails', async () => {
      mockClipboard.writeText.mockRejectedValue(new Error('Write failed'))
      const actions = getActions()
      await act(async () => {
        actions.exportBoard()
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
        actions.exportBoard()
      })
      expect(toast.error).toHaveBeenCalledWith(
        'Clipboard API not available in this browser or context.',
      )
      Object.defineProperty(navigator, 'clipboard', { value: originalClipboard })
    })
  })

  describe('sharePuzzleLink', () => {
    const givens = initialState.board.map((cell, index) =>
      index === 0 ? { ...cell, value: 5, isGiven: true } : cell,
    )
    const progress = givens.map((cell, index) => (index === 1 ? { ...cell, value: 3 } : cell))

    it('copies a link carrying the puzzle without the player progress', async () => {
      mockUseSudokuState.mockReturnValue({ ...defaultState, initialBoard: givens, board: progress })
      const actions = getActions()
      await act(async () => {
        actions.sharePuzzleLink()
      })
      const url = new URL(mockClipboard.writeText.mock.calls[0][0])
      expect(url.origin + url.pathname).toBe(
        globalThis.location.origin + globalThis.location.pathname,
      )
      expect(url.searchParams.get('p')).toBe('5' + '.'.repeat(80))
      expect(toast.success).toHaveBeenCalledWith('Puzzle link copied to clipboard.')
    })

    it('shares the board being typed in customInput mode', async () => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        board: progress,
        solver: { ...defaultState.solver, gameMode: 'customInput' },
      })
      const actions = getActions()
      await act(async () => {
        actions.sharePuzzleLink()
      })
      const url = new URL(mockClipboard.writeText.mock.calls[0][0])
      expect(url.searchParams.get('p')).toBe('53' + '.'.repeat(79))
    })
  })

  describe('stepVisualization', () => {
    const visualizing: SudokuState = {
      ...defaultState,
      solver: {
        ...defaultState.solver,
        gameMode: 'visualizing',
        steps: [
          { technique: 'NakedSingle', placements: [], eliminations: [], cause: [] },
          { technique: 'NakedSingle', placements: [], eliminations: [], cause: [] },
        ],
        currentStepIndex: 1,
      },
    }

    it('moves one step in either direction', () => {
      mockUseSudokuState.mockReturnValue(visualizing)
      const actions = getActions()
      act(() => actions.stepVisualization(-1))
      act(() => actions.stepVisualization(1))
      expect(mockDispatch).toHaveBeenNthCalledWith(1, actionCreators.viewSolverStep(0))
      expect(mockDispatch).toHaveBeenNthCalledWith(2, actionCreators.viewSolverStep(2))
    })

    it('stops at the initial board and at the solution', () => {
      mockUseSudokuState.mockReturnValue({
        ...visualizing,
        solver: { ...visualizing.solver, currentStepIndex: 2 },
      })
      {
        const actions = getActions()
        act(() => actions.stepVisualization(1))
      }
      mockUseSudokuState.mockReturnValue({
        ...visualizing,
        solver: { ...visualizing.solver, currentStepIndex: 0 },
      })
      {
        const actions = getActions()
        act(() => actions.stepVisualization(-1))
      }
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it('does nothing outside visualization', () => {
      {
        const actions = getActions()
        act(() => actions.stepVisualization(1))
      }
      expect(mockDispatch).not.toHaveBeenCalled()
    })
  })

  describe('cycleInputMode', () => {
    it.each([
      ['normal', 'candidate'],
      ['candidate', 'center'],
      ['center', 'normal'],
    ] as const)('goes from %s to %s', (from, to) => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        ui: { ...defaultState.ui, inputMode: from },
      })
      {
        const actions = getActions()
        act(() => actions.cycleInputMode())
      }
      expect(mockDispatch).toHaveBeenCalledWith(actionCreators.setInputMode(to))
    })
  })

  describe('Direct Actions', () => {
    it.each([
      ['requestHint', actionCreators.requestHint()],
      ['clearHint', actionCreators.clearHint()],
      ['pauseGame', actionCreators.pauseGame()],
      ['resumeGame', actionCreators.resumeGame()],
      ['dismissPuzzle', actionCreators.dismissPuzzle()],
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
})
