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

import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import * as React from 'react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as sudokuActions from '@/context/sudoku.actions'
import { initialState } from '@/context/sudoku.reducer'
import type { CellState, SolvingStep } from '@/context/sudoku.types'
import { placeValue, toggleMark } from '@/lib/board'
import { makeState, mockSudoku } from '@/test/sudoku-state'

import { SudokuGrid } from './SudokuGrid'

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
  isHintTarget?: boolean
  isSolved: boolean
  cell: CellState
  eliminatedCandidates?: ReadonlySet<number>
  animateEntry?: boolean
  strikeRemovedNotes?: boolean
}

const mockSudokuCellRender = vi.fn()

vi.mock('./SudokuCell', () => ({
  default: (() => {
    const MockCell = React.forwardRef<HTMLInputElement, MockSudokuCellProps>((props, ref) => {
      mockSudokuCellRender(props)
      return (
        <input
          ref={ref}
          aria-label={`cell-${props.index}`}
          onFocus={() => props.onFocus(props.index)}
          tabIndex={-1}
        />
      )
    })
    MockCell.displayName = 'MockSudokuCell'
    return MockCell
  })(),
}))

describe('SudokuGrid component', () => {
  const mockDispatch = vi.fn()
  const mockActions = {
    setActiveCell: vi.fn(),
    inputValue: vi.fn(),
    eraseActiveCell: vi.fn(),
    navigate: vi.fn(),
    setHighlightedValue: vi.fn(),
    cycleInputMode: vi.fn(),
    offerPuzzle: vi.fn(),
    resumeGame: vi.fn(),
  }
  const defaultState = makeState({
    solver: {
      gameMode: 'playing', // Set to playing for interactive tests
      visualizationBoard: initialState.board,
      solution: null,
    },
    ui: { activeCellIndex: 0 },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockSudokuCellRender.mockClear()
    mockSudoku({ state: defaultState, dispatch: mockDispatch, actions: mockActions })
  })

  it('renders 81 SudokuCell components', () => {
    render(<SudokuGrid />)
    expect(mockSudokuCellRender).toHaveBeenCalledTimes(81)
  })

  it('does not render if displayBoard is null', () => {
    mockSudoku({
      state: makeState(
        { solver: { gameMode: 'visualizing', visualizationBoard: null } },
        defaultState,
      ),
    })
    const { container } = render(<SudokuGrid />)
    expect(container).toBeEmptyDOMElement()
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
    // Every cell starts inactive
    mockSudoku({
      state: makeState({ board: boardWithGiven, ui: { activeCellIndex: null } }, defaultState),
    })
    render(<SudokuGrid />)
    const cell10 = screen.getByLabelText('cell-10')
    fireEvent.focus(cell10)
    expect(mockActions.setActiveCell).toHaveBeenCalledWith(10)
  })

  it('does not call setActiveCell when in visualizing mode', () => {
    mockSudoku({ state: makeState({ solver: { gameMode: 'visualizing' } }, defaultState) })
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
    mockSudoku({ state: makeState({ ui: { activeCellIndex: null } }, defaultState) })
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
    mockSudoku({
      state: makeState({ board: boardWithValues, ui: { highlightedValue: 5 } }, defaultState),
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
    mockSudoku({
      state: makeState(
        {
          board: boardWithValues,
          ui: { activeCellIndex: 4, highlightedValue: 5 },
          solver: { isSolved: true },
        },
        defaultState,
      ),
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
      mockSudoku({ state: makeState({ solver: { gameMode: 'visualizing' } }, defaultState) })
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

    it('erases the active cell on 0', () => {
      render(<SudokuGrid />)
      fireEvent.keyDown(screen.getByRole('grid'), { key: '0' })
      expect(mockActions.eraseActiveCell).toHaveBeenCalledWith('delete')
      expect(mockActions.inputValue).not.toHaveBeenCalled()
    })

    it.each([' ', 'n', 'N'])('cycles the input mode on %j', (key) => {
      render(<SudokuGrid />)
      const grid = screen.getByRole('grid')
      const event = createEvent.keyDown(grid, { key })
      event.preventDefault = vi.fn()
      fireEvent(grid, event)
      expect(mockActions.cycleInputMode).toHaveBeenCalledOnce()
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('leaves modified keys to the browser and global shortcuts', () => {
      render(<SudokuGrid />)
      const grid = screen.getByRole('grid')
      for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
        const event = createEvent.keyDown(grid, { key: '5', [modifier]: true })
        event.preventDefault = vi.fn()
        fireEvent(grid, event)
        expect(event.preventDefault).not.toHaveBeenCalled()
      }
      expect(mockActions.inputValue).not.toHaveBeenCalled()
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
    const paste = (text: string) => {
      const grid = screen.getByRole('grid')
      fireEvent.paste(grid, { clipboardData: { getData: () => text } })
    }

    beforeEach(() => {
      mockSudoku({ state: makeState({ solver: { gameMode: 'customInput' } }, defaultState) })
    })

    it('reads the event data rather than the clipboard API', () => {
      const readTextSpy = vi.spyOn(navigator.clipboard, 'readText')
      render(<SudokuGrid />)
      paste(validBoardString)

      expect(readTextSpy).not.toHaveBeenCalled()
      expect(mockDispatch).toHaveBeenCalledWith(sudokuActions.importBoard(validBoardString))
      expect(toast.success).toHaveBeenCalledWith('Board imported from clipboard.')
      readTextSpy.mockRestore()
    })

    it('ignores whitespace and line breaks around the pasted puzzle', () => {
      render(<SudokuGrid />)
      paste(`  ${'1........\n'.repeat(9)}  `)
      expect(mockDispatch).toHaveBeenCalledWith(sudokuActions.importBoard('1........'.repeat(9)))
    })

    it('offers the pasted puzzle instead of importing it during play', () => {
      mockSudoku({ state: defaultState })
      render(<SudokuGrid />)
      paste(validBoardString)

      expect(mockActions.offerPuzzle).toHaveBeenCalledWith(validBoardString)
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it('does not handle paste while visualizing', () => {
      mockSudoku({ state: makeState({ solver: { gameMode: 'visualizing' } }, defaultState) })
      render(<SudokuGrid />)
      paste(validBoardString)

      expect(mockDispatch).not.toHaveBeenCalled()
      expect(mockActions.offerPuzzle).not.toHaveBeenCalled()
    })

    it('shows an error toast for invalid paste string', () => {
      render(<SudokuGrid />)
      paste('abc')

      expect(mockDispatch).not.toHaveBeenCalled()
      expect(toast.error).toHaveBeenCalledWith('Invalid board format in clipboard.')
    })
  })

  describe('Hints', () => {
    const lastPropsFor = (index: number): MockSudokuCellProps =>
      mockSudokuCellRender.mock.calls
        .map(([p]) => p as MockSudokuCellProps)
        .filter((p) => p.index === index)
        .at(-1)!

    it('marks the cause cells and the placement of a step hint', () => {
      const step: SolvingStep = {
        technique: 'HiddenSingle',
        placements: [{ index: 4, value: 7 }],
        eliminations: [{ index: 5, value: 7 }],
        cause: [{ index: 9, candidates: [7] }],
      }
      mockSudoku({ state: makeState({ ui: { hint: { kind: 'step', step } } }, defaultState) })
      render(<SudokuGrid />)

      expect(lastPropsFor(4).isHintTarget).toBe(true)
      expect(lastPropsFor(5).isHintTarget).toBe(false)
      expect(lastPropsFor(9).isCause).toBe(true)
      expect(lastPropsFor(5).eliminatedCandidates).toEqual(new Set([7]))
    })

    it('marks the eliminated cells when a step places nothing', () => {
      const step: SolvingStep = {
        technique: 'PointingPair',
        placements: [],
        eliminations: [
          { index: 6, value: 3 },
          { index: 6, value: 4 },
        ],
        cause: [],
      }
      mockSudoku({ state: makeState({ ui: { hint: { kind: 'step', step } } }, defaultState) })
      render(<SudokuGrid />)

      expect(lastPropsFor(6).isHintTarget).toBe(true)
      expect(lastPropsFor(6).eliminatedCandidates).toEqual(new Set([3, 4]))
    })

    it('marks the single cell of a mistake hint', () => {
      mockSudoku({
        state: makeState({ ui: { hint: { kind: 'mistake', index: 12 } } }, defaultState),
      })
      render(<SudokuGrid />)
      expect(lastPropsFor(12).isHintTarget).toBe(true)
      expect(lastPropsFor(13).isHintTarget).toBe(false)
    })

    it('ignores a hint outside play', () => {
      mockSudoku({
        state: makeState(
          { solver: { gameMode: 'customInput' }, ui: { hint: { kind: 'mistake', index: 12 } } },
          defaultState,
        ),
      })
      render(<SudokuGrid />)
      expect(lastPropsFor(12).isHintTarget).toBe(false)
    })
  })

  describe('Pause', () => {
    it('hides the board behind a resume overlay and ignores keys', async () => {
      const user = userEvent.setup()
      mockSudoku({ state: makeState({ ui: { isPaused: true } }, defaultState) })
      render(<SudokuGrid />)

      const grid = screen.getByRole('grid', { hidden: true })
      expect(grid).toHaveClass('invisible')
      fireEvent.keyDown(grid, { key: '5' })
      expect(mockActions.inputValue).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Resume' }))
      expect(mockActions.resumeGame).toHaveBeenCalledOnce()
    })
  })

  it('shows a won board with user colours by passing isSolved only while visualizing', () => {
    mockSudoku({ state: makeState({ solver: { isSolved: true } }, defaultState) })
    render(<SudokuGrid />)
    expect(mockSudokuCellRender).toHaveBeenLastCalledWith(
      expect.objectContaining({ isSolved: false }),
    )
  })

  describe('when in visualizing mode', () => {
    it('passes correct candidates and eliminations to SudokuCell', () => {
      const mockElimination = { index: 1, value: 5 }
      const mockCandidates: (Set<number> | null)[] = new Array(81).fill(null)
      mockCandidates[0] = new Set([2, 4])
      mockCandidates[1] = new Set([5, 7])

      const visualizingState = makeState(
        {
          solver: {
            gameMode: 'visualizing',
            visualizationBoard: initialState.board.map((c, i) =>
              i === 0 ? { ...c, value: 9 } : c,
            ),
            candidatesForViz: mockCandidates,
            eliminationsForViz: [mockElimination],
          },
        },
        defaultState,
      )

      mockSudoku({ state: visualizingState })
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
      const visualizingState = makeState(
        {
          solver: {
            gameMode: 'visualizing',
            visualizationBoard: initialState.board,
            candidatesForViz: [],
            eliminationsForViz: null,
          },
        },
        defaultState,
      )

      mockSudoku({ state: visualizingState })
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
      const visualizingState = makeState(
        {
          solver: {
            gameMode: 'visualizing',
            visualizationBoard: initialState.board,
            steps: [mockStep],
            currentStepIndex: 1,
          },
        },
        defaultState,
      )
      mockSudoku({ state: visualizingState })
      render(<SudokuGrid />)

      const cell10Props = mockSudokuCellRender.mock.calls[10][0]
      const cell11Props = mockSudokuCellRender.mock.calls[11][0]
      const cell12Props = mockSudokuCellRender.mock.calls[12][0]

      expect(cell10Props.isCause).toBe(true)
      expect(cell11Props.isCause).toBe(true)
      expect(cell12Props.isCause).toBe(false)
    })

    it('passes isPlaced=true to the correct cells', () => {
      const visualizingState = makeState(
        {
          solver: {
            gameMode: 'visualizing',
            visualizationBoard: initialState.board,
            steps: [mockStep],
            currentStepIndex: 1,
          },
        },
        defaultState,
      )
      mockSudoku({ state: visualizingState })
      render(<SudokuGrid />)

      const cell15Props = mockSudokuCellRender.mock.calls[15][0]
      const cell10Props = mockSudokuCellRender.mock.calls[10][0]

      expect(cell15Props.isPlaced).toBe(true)
      expect(cell10Props.isPlaced).toBe(false)
    })

    it('returns empty sets for cause and placed if currentStepIndex is 0', () => {
      const visualizingState = makeState(
        {
          solver: {
            gameMode: 'visualizing',
            visualizationBoard: initialState.board,
            steps: [mockStep],
            currentStepIndex: 0,
          },
        },
        defaultState,
      )
      mockSudoku({ state: visualizingState })
      render(<SudokuGrid />)

      mockSudokuCellRender.mock.calls.forEach((call) => {
        const props = call[0] as MockSudokuCellProps
        expect(props.isCause).toBe(false)
        expect(props.isPlaced).toBe(false)
      })
    })

    it('returns empty sets if currentStepIndex is out of bounds', () => {
      const visualizingState = makeState(
        {
          solver: {
            gameMode: 'visualizing',
            visualizationBoard: initialState.board,
            steps: [], // Empty steps
            currentStepIndex: 1, // Index 1 implies asking for steps[0], which doesn't exist
          },
        },
        defaultState,
      )
      mockSudoku({ state: visualizingState })
      render(<SudokuGrid />)

      // Expect no highlights, confirming the guard clause returned empty Sets
      mockSudokuCellRender.mock.calls.forEach((call) => {
        const props = call[0] as MockSudokuCellProps
        expect(props.isCause).toBe(false)
        expect(props.isPlaced).toBe(false)
      })
    })

    it('handles a step with no placements safely (empty array)', () => {
      const visualizingState = makeState(
        {
          solver: {
            gameMode: 'visualizing',
            visualizationBoard: initialState.board,
            steps: [mockStepNoPlacements],
            currentStepIndex: 1,
          },
        },
        defaultState,
      )
      mockSudoku({ state: visualizingState })
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
      const solution = new Array(81).fill(correctValue)
      const boardWithWrongValue = initialState.board.map((cell, index) =>
        index === 0 ? { ...cell, value: wrongValue, isGiven: false } : cell,
      )

      mockSudoku({
        state: makeState(
          { board: boardWithWrongValue, solver: { gameMode: 'playing', solution } },
          defaultState,
        ),
      })

      render(<SudokuGrid />)

      const cell0Props = mockSudokuCellRender.mock.calls[0][0]
      expect(cell0Props.isError).toBe(true)
    })

    it('does not mark a cell as isError if value matches solution', () => {
      const correctValue = 9
      const solution = new Array(81).fill(correctValue)
      const boardWithCorrectValue = initialState.board.map((cell, index) =>
        index === 0 ? { ...cell, value: correctValue, isGiven: false } : cell,
      )

      mockSudoku({
        state: makeState(
          { board: boardWithCorrectValue, solver: { gameMode: 'playing', solution } },
          defaultState,
        ),
      })

      render(<SudokuGrid />)

      const cell0Props = mockSudokuCellRender.mock.calls[0][0]
      expect(cell0Props.isError).toBe(false)
    })

    it('does not mark given cells as errors', () => {
      // Even if given somehow mismatches solution (shouldn't happen in valid state),
      // we usually trust givens. But logic says !isGiven.
      const solution = new Array(81).fill(9)
      const boardWithGiven = initialState.board.map((cell, index) =>
        index === 0 ? { ...cell, value: 5, isGiven: true } : cell,
      )

      mockSudoku({
        state: makeState(
          { board: boardWithGiven, solver: { gameMode: 'playing', solution } },
          defaultState,
        ),
      })

      render(<SudokuGrid />)
      const cell0Props = mockSudokuCellRender.mock.calls[0][0]
      expect(cell0Props.isError).toBe(false)
    })

    it('does not mark cells as error if solution is not available', () => {
      const boardWithVal = initialState.board.map((cell, index) =>
        index === 0 ? { ...cell, value: 5, isGiven: false } : cell,
      )

      mockSudoku({
        state: makeState(
          { board: boardWithVal, solver: { gameMode: 'playing', solution: null } },
          defaultState,
        ),
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
      mockSudoku({ state: makeState({ ui: { activeCellIndex: 5 } }, defaultState) })
    })
    rerender(<SudokuGrid />)

    expect(focusSpy).toHaveBeenCalledTimes(2)

    focusSpy.mockRestore()
  })

  describe('Motion', () => {
    const lastPropsOf = (index: number) =>
      (mockSudokuCellRender.mock.calls as [MockSudokuCellProps][])
        .map(([props]) => props)
        .filter((props) => props.index === index)
        .pop()

    // Cells 1 and 2 share row 0 with the placement, while cell 40 is not its peer.
    const noted = [1, 2, 40].reduce(
      (board, index) => toggleMark(board, index, 'candidate', 5),
      initialState.board,
    )

    it('animates nothing on the first board', () => {
      mockSudoku({ state: makeState({ board: noted }, defaultState) })
      render(<SudokuGrid />)
      expect(mockSudokuCellRender).not.toHaveBeenCalledWith(
        expect.objectContaining({ animateEntry: true }),
      )
      expect(mockSudokuCellRender).not.toHaveBeenCalledWith(
        expect.objectContaining({ strikeRemovedNotes: true }),
      )
    })

    it('inks the placed digit and strikes the notes only of the peers it changed', () => {
      mockSudoku({ state: makeState({ board: noted }, defaultState) })
      const { rerender } = render(<SudokuGrid />)

      mockSudoku({ state: makeState({ board: placeValue(noted, 0, 5) }, defaultState) })
      rerender(<SudokuGrid />)

      expect(lastPropsOf(0)).toMatchObject({ animateEntry: true, strikeRemovedNotes: false })
      expect(lastPropsOf(1)).toMatchObject({ animateEntry: false, strikeRemovedNotes: true })
      expect(lastPropsOf(2)).toMatchObject({ strikeRemovedNotes: true })
      expect(lastPropsOf(3)).toMatchObject({ strikeRemovedNotes: false })
      expect(lastPropsOf(40)).toMatchObject({ strikeRemovedNotes: false })
    })

    it('animates nothing when undo returns the notes', () => {
      const placed = placeValue(noted, 0, 5)
      mockSudoku({ state: makeState({ board: placed }, defaultState) })
      const { rerender } = render(<SudokuGrid />)

      mockSudoku({ state: makeState({ board: noted }, defaultState) })
      rerender(<SudokuGrid />)

      expect(lastPropsOf(0)).toMatchObject({ animateEntry: false })
      expect(lastPropsOf(1)).toMatchObject({ strikeRemovedNotes: false })
    })

    it('animates nothing while visualizing', () => {
      mockSudoku({ state: makeState({ board: noted }, defaultState) })
      const { rerender } = render(<SudokuGrid />)

      mockSudoku({
        state: makeState(
          { board: placeValue(noted, 0, 5), solver: { gameMode: 'visualizing' } },
          defaultState,
        ),
      })
      rerender(<SudokuGrid />)

      expect(lastPropsOf(0)).toMatchObject({ animateEntry: false })
      expect(lastPropsOf(1)).toMatchObject({ strikeRemovedNotes: false })
    })
  })
})
