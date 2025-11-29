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

import React from 'react'
import { render, fireEvent, act, screen, createEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SudokuGrid } from './SudokuGrid'
import { useSudokuState, useSudokuDispatch } from '@/context/sudoku.hooks'
import { useSudokuActions } from '@/hooks/useSudokuActions'
import { initialState } from '@/context/sudoku.reducer'
import * as sudokuActions from '@/context/sudoku.actions'
import type { SudokuState, CellState, SolvingStep } from '@/context/sudoku.types'
import { toast } from 'sonner'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

interface MockSudokuCellProps {
  index: number
  onFocus: (index: number) => void
  isHighlighted: boolean
  isNumberHighlighted: boolean
  isActive: boolean
  isCause: boolean
  isPlaced: boolean
  isError?: boolean
  cell: CellState
  eliminatedCandidates?: ReadonlySet<number>
}

const mockSudokuCellRender = vi.fn()

vi.mock('./SudokuCell', () => ({
  default: React.forwardRef<HTMLInputElement, MockSudokuCellProps>((props, ref) => {
    mockSudokuCellRender(props)
    return (
      <input
        ref={ref}
        aria-label={`cell-${props.index}`}
        onFocus={() => props.onFocus(props.index)}
        tabIndex={-1}
      />
    )
  }),
}))

const mockUseSudokuState = useSudokuState as Mock
const mockUseSudokuDispatch = useSudokuDispatch as Mock
const mockUseSudokuActions = useSudokuActions as Mock

describe('SudokuGrid component', () => {
  const mockDispatch = vi.fn()
  const mockActions = {
    setActiveCell: vi.fn(),
    inputValue: vi.fn(),
    eraseActiveCell: vi.fn(),
    navigate: vi.fn(),
    setHighlightedValue: vi.fn(),
  }
  const defaultState: SudokuState = {
    ...initialState,
    solver: {
      ...initialState.solver,
      gameMode: 'playing', // Set to playing for interactive tests
      visualizationBoard: initialState.board,
      solution: null,
    },
    ui: {
      ...initialState.ui,
      activeCellIndex: 0,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSudokuCellRender.mockClear()
    mockUseSudokuState.mockReturnValue(defaultState)
    mockUseSudokuDispatch.mockReturnValue(mockDispatch)
    mockUseSudokuActions.mockReturnValue(mockActions)
  })

  it('renders 81 SudokuCell components', () => {
    render(<SudokuGrid />)
    expect(mockSudokuCellRender).toHaveBeenCalledTimes(81)
  })

  it('does not render if displayBoard is null', () => {
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      solver: {
        ...defaultState.solver,
        gameMode: 'visualizing',
        visualizationBoard: null,
      },
    })
    const { container } = render(<SudokuGrid />)
    expect(container.firstChild).toBeNull()
  })

  it('calls setActiveCell when a cell is focused in playing mode', () => {
    render(<SudokuGrid />)
    const cell10 = screen.getByLabelText('cell-10')
    fireEvent.focus(cell10)
    expect(mockActions.setActiveCell).toHaveBeenCalledWith(10)
  })

  it('allows a "given" cell to become active on focus', () => {
    const boardWithGiven = defaultState.board.map((c, i) =>
      i === 10 ? { ...c, isGiven: true } : c,
    )
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      board: boardWithGiven,
      ui: { ...defaultState.ui, activeCellIndex: null }, // Start with no cell active
    })
    render(<SudokuGrid />)
    const cell10 = screen.getByLabelText('cell-10')
    fireEvent.focus(cell10)
    expect(mockActions.setActiveCell).toHaveBeenCalledWith(10)
  })

  it('does not call setActiveCell when in visualizing mode', () => {
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      solver: {
        ...defaultState.solver,
        gameMode: 'visualizing',
      },
    })
    render(<SudokuGrid />)
    const cell10 = screen.getByLabelText('cell-10')
    fireEvent.focus(cell10)
    expect(mockActions.setActiveCell).not.toHaveBeenCalled()
  })

  it('calls setActiveCell with null when the grid loses focus', () => {
    render(<SudokuGrid />)
    const grid = screen.getByRole('grid')
    const outsideElement = document.createElement('button')
    document.body.appendChild(outsideElement)

    fireEvent.blur(grid, { relatedTarget: outsideElement })

    expect(mockActions.setActiveCell).toHaveBeenCalledWith(null)

    document.body.removeChild(outsideElement)
  })

  it('does not dispatch when focus moves to another cell within the grid', () => {
    render(<SudokuGrid />)
    const grid = screen.getByRole('grid')
    const cell1 = screen.getByLabelText('cell-1')
    mockActions.setActiveCell.mockClear()

    fireEvent.blur(grid, { relatedTarget: cell1 })

    expect(mockActions.setActiveCell).not.toHaveBeenCalled()
  })

  it('does not highlight any cells when no cell is active', () => {
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      ui: { ...defaultState.ui, activeCellIndex: null },
    })
    render(<SudokuGrid />)

    const firstCellProps = mockSudokuCellRender.mock.calls[0][0]
    expect(firstCellProps.isHighlighted).toBe(false)

    const lastCellProps = mockSudokuCellRender.mock.calls[80][0]
    expect(lastCellProps.isHighlighted).toBe(false)
  })

  it('passes isNumberHighlighted correctly', () => {
    const boardWithValues = initialState.board.map((cell, index) => ({
      ...cell,
      value: (index % 9) + 1,
    }))
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      board: boardWithValues,
      ui: { ...defaultState.ui, highlightedValue: 5 },
    })
    render(<SudokuGrid />)

    const cell4Props = mockSudokuCellRender.mock.calls[4][0]
    expect(cell4Props.isNumberHighlighted).toBe(true)

    const cell5Props = mockSudokuCellRender.mock.calls[5][0]
    expect(cell5Props.isNumberHighlighted).toBe(false)
  })

  it('removes all visual highlights (active, peers, number) when puzzle is solved', () => {
    const boardWithValues = initialState.board.map((cell, index) => ({
      ...cell,
      value: (index % 9) + 1,
    }))
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      board: boardWithValues,
      ui: { ...defaultState.ui, activeCellIndex: 4, highlightedValue: 5 },
      solver: { ...defaultState.solver, isSolved: true },
    })
    render(<SudokuGrid />)

    const cell4Props = mockSudokuCellRender.mock.calls[4][0]
    // Normally would be active/highlighted, but isSolved prevents it
    expect(cell4Props.isActive).toBe(false)
    expect(cell4Props.isHighlighted).toBe(false)
    expect(cell4Props.isNumberHighlighted).toBe(false)
  })

  describe('Keyboard Interactions', () => {
    it('calls inputValue and setHighlightedValue on number key press', async () => {
      const user = userEvent.setup()
      render(<SudokuGrid />)
      const grid = screen.getByRole('grid')
      grid.focus()
      await user.keyboard('{5}')
      expect(mockActions.inputValue).toHaveBeenCalledWith(5)
      expect(mockActions.setHighlightedValue).toHaveBeenCalledWith(5)
    })

    it('ignores keyboard input when in a read-only mode', async () => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        solver: { ...defaultState.solver, gameMode: 'visualizing' },
      })
      const user = userEvent.setup()
      render(<SudokuGrid />)
      const grid = screen.getByRole('grid')
      grid.focus()
      await user.keyboard('{5}')
      expect(mockActions.inputValue).not.toHaveBeenCalled()
    })

    it.each([
      ['{ArrowUp}', 'up'],
      ['{ArrowDown}', 'down'],
      ['{ArrowLeft}', 'left'],
      ['{ArrowRight}', 'right'],
    ])('calls navigate for %s key', async (key, direction) => {
      const user = userEvent.setup()
      render(<SudokuGrid />)
      const grid = screen.getByRole('grid')
      grid.focus()
      await user.keyboard(key)
      expect(mockActions.navigate).toHaveBeenCalledWith(direction)
    })

    it('handles Backspace to call eraseActiveCell("backspace")', async () => {
      const user = userEvent.setup()
      render(<SudokuGrid />)
      const grid = screen.getByRole('grid')
      grid.focus()
      await user.keyboard('{Backspace}')
      expect(mockActions.eraseActiveCell).toHaveBeenCalledWith('backspace')
    })

    it('handles Delete to call eraseActiveCell("delete")', async () => {
      const user = userEvent.setup()
      render(<SudokuGrid />)
      const grid = screen.getByRole('grid')
      grid.focus()
      await user.keyboard('{Delete}')
      expect(mockActions.eraseActiveCell).toHaveBeenCalledWith('delete')
    })

    it('calls preventDefault for handled keys', () => {
      render(<SudokuGrid />)
      const grid = screen.getByRole('grid')

      const event = createEvent.keyDown(grid, { key: 'ArrowRight' })
      event.preventDefault = vi.fn()

      fireEvent(grid, event)
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('does not call preventDefault for unhandled keys', () => {
      render(<SudokuGrid />)
      const grid = screen.getByRole('grid')

      const event = createEvent.keyDown(grid, { key: 'a' })
      event.preventDefault = vi.fn()

      fireEvent(grid, event)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })
  })

  describe('Clipboard (Paste) Interactions', () => {
    const validBoardString = '.'.repeat(81)

    beforeEach(() => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        solver: {
          ...defaultState.solver,
          gameMode: 'customInput',
        },
      })
    })

    it('dispatches importBoard action on valid paste in customInput mode', async () => {
      const readTextSpy = vi
        .spyOn(navigator.clipboard, 'readText')
        .mockResolvedValue(validBoardString)

      render(<SudokuGrid />)
      const grid = screen.getByRole('grid')
      fireEvent.paste(grid)
      await act(async () => await Promise.resolve())

      expect(readTextSpy).toHaveBeenCalled()
      expect(mockDispatch).toHaveBeenCalledWith(sudokuActions.importBoard(validBoardString))
      expect(toast.success).toHaveBeenCalledWith('Board imported from clipboard.')
      readTextSpy.mockRestore()
    })

    it('does not handle paste when not in customInput mode', async () => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        solver: { ...defaultState.solver, gameMode: 'playing' },
      })
      const readTextSpy = vi.spyOn(navigator.clipboard, 'readText')
      render(<SudokuGrid />)
      const grid = screen.getByRole('grid')

      fireEvent.paste(grid)
      await act(async () => await Promise.resolve())

      expect(readTextSpy).not.toHaveBeenCalled()
      expect(mockDispatch).not.toHaveBeenCalled()
      readTextSpy.mockRestore()
    })

    it('shows an error toast for invalid paste string', async () => {
      const invalidString = 'abc'
      const readTextSpy = vi.spyOn(navigator.clipboard, 'readText').mockResolvedValue(invalidString)

      render(<SudokuGrid />)
      const grid = screen.getByRole('grid')
      fireEvent.paste(grid)
      await act(async () => await Promise.resolve())

      expect(mockDispatch).not.toHaveBeenCalled()
      expect(toast.error).toHaveBeenCalledWith('Invalid board format in clipboard.')
      readTextSpy.mockRestore()
    })

    it('shows an error toast if clipboard read fails', async () => {
      const readTextSpy = vi
        .spyOn(navigator.clipboard, 'readText')
        .mockRejectedValue(new Error('Read failed'))

      render(<SudokuGrid />)
      const grid = screen.getByRole('grid')
      fireEvent.paste(grid)
      await act(async () => await Promise.resolve())

      expect(mockDispatch).not.toHaveBeenCalled()
      expect(toast.error).toHaveBeenCalledWith('Could not read from clipboard.')
      readTextSpy.mockRestore()
    })
  })

  describe('when in visualizing mode', () => {
    it('passes correct candidates and eliminations to SudokuCell', () => {
      const mockElimination = { index: 1, value: 5 }
      const mockCandidates: (Set<number> | null)[] = Array(81).fill(null)
      mockCandidates[0] = new Set([2, 4])
      mockCandidates[1] = new Set([5, 7])

      const visualizingState: SudokuState = {
        ...defaultState,
        solver: {
          ...defaultState.solver,
          gameMode: 'visualizing',
          visualizationBoard: initialState.board.map((c, i) => (i === 0 ? { ...c, value: 9 } : c)),
          candidatesForViz: mockCandidates,
          eliminationsForViz: [mockElimination],
        },
      }

      mockUseSudokuState.mockReturnValue(visualizingState)
      render(<SudokuGrid />)

      const cell0Props = mockSudokuCellRender.mock.calls[0][0]
      expect(cell0Props.cell.candidates).toEqual(new Set([2, 4]))
      expect(cell0Props.eliminatedCandidates).toEqual(new Set())

      const cell1Props = mockSudokuCellRender.mock.calls[1][0]
      expect(cell1Props.cell.candidates).toEqual(new Set([5, 7]))
      expect(cell1Props.eliminatedCandidates).toEqual(new Set([5]))

      const cell2Props = mockSudokuCellRender.mock.calls[2][0]
      expect(cell2Props.cell.candidates).toEqual(new Set())
      expect(cell2Props.eliminatedCandidates).toEqual(new Set())
    })

    it('handles null eliminationsForViz gracefully', () => {
      const visualizingState: SudokuState = {
        ...defaultState,
        solver: {
          ...defaultState.solver,
          gameMode: 'visualizing',
          visualizationBoard: initialState.board,
          candidatesForViz: [],
          eliminationsForViz: null,
        },
      }

      mockUseSudokuState.mockReturnValue(visualizingState)
      render(<SudokuGrid />)

      const cell0Props = mockSudokuCellRender.mock.calls[0][0]
      expect(cell0Props.eliminatedCandidates).toEqual(new Set())
    })
  })

  describe('causeIndices and placedIndices calculation', () => {
    const mockStep: SolvingStep = {
      technique: 'NakedPair',
      placements: [{ index: 15, value: 3 }],
      eliminations: [],
      cause: [
        { index: 10, candidates: [1, 2] },
        { index: 11, candidates: [1, 2] },
      ],
    }

    const mockStepNoPlacements: SolvingStep = {
      technique: 'PointingPair',
      placements: [],
      eliminations: [],
      cause: [],
    }

    it('passes isCause=true to the correct cells', () => {
      const visualizingState: SudokuState = {
        ...defaultState,
        solver: {
          ...defaultState.solver,
          gameMode: 'visualizing',
          visualizationBoard: initialState.board,
          steps: [mockStep],
          currentStepIndex: 1,
        },
      }
      mockUseSudokuState.mockReturnValue(visualizingState)
      render(<SudokuGrid />)

      const cell10Props = mockSudokuCellRender.mock.calls[10][0]
      const cell11Props = mockSudokuCellRender.mock.calls[11][0]
      const cell12Props = mockSudokuCellRender.mock.calls[12][0]

      expect(cell10Props.isCause).toBe(true)
      expect(cell11Props.isCause).toBe(true)
      expect(cell12Props.isCause).toBe(false)
    })

    it('passes isPlaced=true to the correct cells', () => {
      const visualizingState: SudokuState = {
        ...defaultState,
        solver: {
          ...defaultState.solver,
          gameMode: 'visualizing',
          visualizationBoard: initialState.board,
          steps: [mockStep],
          currentStepIndex: 1,
        },
      }
      mockUseSudokuState.mockReturnValue(visualizingState)
      render(<SudokuGrid />)

      const cell15Props = mockSudokuCellRender.mock.calls[15][0]
      const cell10Props = mockSudokuCellRender.mock.calls[10][0]

      expect(cell15Props.isPlaced).toBe(true)
      expect(cell10Props.isPlaced).toBe(false)
    })

    it('returns empty sets for cause and placed if currentStepIndex is 0', () => {
      const visualizingState: SudokuState = {
        ...defaultState,
        solver: {
          ...defaultState.solver,
          gameMode: 'visualizing',
          visualizationBoard: initialState.board,
          steps: [mockStep],
          currentStepIndex: 0,
        },
      }
      mockUseSudokuState.mockReturnValue(visualizingState)
      render(<SudokuGrid />)

      mockSudokuCellRender.mock.calls.forEach((call) => {
        const props = call[0] as MockSudokuCellProps
        expect(props.isCause).toBe(false)
        expect(props.isPlaced).toBe(false)
      })
    })

    it('returns empty sets if currentStepIndex is out of bounds', () => {
      const visualizingState: SudokuState = {
        ...defaultState,
        solver: {
          ...defaultState.solver,
          gameMode: 'visualizing',
          visualizationBoard: initialState.board,
          steps: [], // Empty steps
          currentStepIndex: 1, // Index 1 implies asking for steps[0], which doesn't exist
        },
      }
      mockUseSudokuState.mockReturnValue(visualizingState)
      render(<SudokuGrid />)

      // Expect no highlights, confirming the guard clause returned empty Sets
      mockSudokuCellRender.mock.calls.forEach((call) => {
        const props = call[0] as MockSudokuCellProps
        expect(props.isCause).toBe(false)
        expect(props.isPlaced).toBe(false)
      })
    })

    it('handles a step with no placements safely (empty array)', () => {
      const visualizingState: SudokuState = {
        ...defaultState,
        solver: {
          ...defaultState.solver,
          gameMode: 'visualizing',
          visualizationBoard: initialState.board,
          steps: [mockStepNoPlacements],
          currentStepIndex: 1,
        },
      }
      mockUseSudokuState.mockReturnValue(visualizingState)
      render(<SudokuGrid />)

      mockSudokuCellRender.mock.calls.forEach((call) => {
        const props = call[0] as MockSudokuCellProps
        expect(props.isPlaced).toBe(false)
      })
    })
  })

  describe('Validation (Error Marking)', () => {
    it('marks a cell as isError if value mismatches solution', () => {
      const wrongValue = 5
      const correctValue = 9
      const solution = Array(81).fill(correctValue)
      const boardWithWrongValue = initialState.board.map((cell, index) =>
        index === 0 ? { ...cell, value: wrongValue, isGiven: false } : cell,
      )

      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        board: boardWithWrongValue,
        solver: {
          ...defaultState.solver,
          gameMode: 'playing',
          solution,
        },
      })

      render(<SudokuGrid />)

      const cell0Props = mockSudokuCellRender.mock.calls[0][0]
      expect(cell0Props.isError).toBe(true)
    })

    it('does not mark a cell as isError if value matches solution', () => {
      const correctValue = 9
      const solution = Array(81).fill(correctValue)
      const boardWithCorrectValue = initialState.board.map((cell, index) =>
        index === 0 ? { ...cell, value: correctValue, isGiven: false } : cell,
      )

      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        board: boardWithCorrectValue,
        solver: {
          ...defaultState.solver,
          gameMode: 'playing',
          solution,
        },
      })

      render(<SudokuGrid />)

      const cell0Props = mockSudokuCellRender.mock.calls[0][0]
      expect(cell0Props.isError).toBe(false)
    })

    it('does not mark given cells as errors', () => {
      // Even if given somehow mismatches solution (shouldn't happen in valid state),
      // we usually trust givens. But logic says !isGiven.
      const solution = Array(81).fill(9)
      const boardWithGiven = initialState.board.map((cell, index) =>
        index === 0 ? { ...cell, value: 5, isGiven: true } : cell,
      )

      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        board: boardWithGiven,
        solver: {
          ...defaultState.solver,
          gameMode: 'playing',
          solution,
        },
      })

      render(<SudokuGrid />)
      const cell0Props = mockSudokuCellRender.mock.calls[0][0]
      expect(cell0Props.isError).toBe(false)
    })

    it('does not mark cells as error if solution is not available', () => {
      const boardWithVal = initialState.board.map((cell, index) =>
        index === 0 ? { ...cell, value: 5, isGiven: false } : cell,
      )

      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        board: boardWithVal,
        solver: {
          ...defaultState.solver,
          gameMode: 'playing',
          solution: null,
        },
      })

      render(<SudokuGrid />)
      const cell0Props = mockSudokuCellRender.mock.calls[0][0]
      expect(cell0Props.isError).toBe(false)
    })
  })

  it('focuses the correct cell when activeCellIndex changes', () => {
    const focusSpy = vi.spyOn(window.HTMLInputElement.prototype, 'focus')
    const { rerender } = render(<SudokuGrid />)

    expect(focusSpy).toHaveBeenCalledTimes(1)

    act(() => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        ui: { ...defaultState.ui, activeCellIndex: 5 },
      })
    })
    rerender(<SudokuGrid />)

    expect(focusSpy).toHaveBeenCalledTimes(2)

    focusSpy.mockRestore()
  })
})
