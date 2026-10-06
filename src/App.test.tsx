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

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import App from './App'
import { useSudokuState } from './context/sudoku.hooks'
import { initialState } from './context/sudoku.reducer'
import type { SudokuState } from './context/sudoku.types'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSudokuActions } from './hooks/useSudokuActions'

vi.mock('./context/sudoku.hooks')
vi.mock('./hooks/useSudokuActions')
vi.mock('./hooks/useSynchronizedHeight', () => ({
  useSynchronizedHeight: vi.fn(() => ({
    sourceRef: vi.fn(),
    targetRef: vi.fn(),
  })),
}))
vi.mock('./components/SudokuGrid', () => ({
  SudokuGrid: vi.fn(() => <div data-testid="sudoku-grid" />),
}))
vi.mock('./components/NumberPad', () => ({
  NumberPad: vi.fn(() => <button>NumberPad</button>),
}))
vi.mock('./components/controls/NewPuzzleButton', () => ({
  NewPuzzleButton: vi.fn(() => <button>New Puzzle</button>),
}))
vi.mock('./components/controls/SolveButton', () => ({
  SolveButton: vi.fn(() => <button>Solve</button>),
}))
vi.mock('./components/controls/ClearButton', () => ({
  ClearButton: vi.fn(() => <button>Clear</button>),
}))
vi.mock('./components/controls/UndoRedo', () => ({
  UndoRedo: vi.fn(() => (
    <>
      <button>Undo</button>
      <button>Redo</button>
    </>
  )),
}))
vi.mock('./components/controls/InputModeToggle', () => ({
  InputModeToggle: vi.fn(() => <button>Toggle Mode</button>),
}))
vi.mock('./components/mode-toggle', () => ({
  ModeToggle: vi.fn(() => <button>Toggle Theme</button>),
}))
vi.mock('./components/SolverStepsPanel', () => ({
  SolverStepsPanel: vi.fn(() => <div data-testid="solver-steps-panel" />),
}))
vi.mock('./components/controls/HintButton', () => ({
  HintButton: vi.fn(() => <button>Hint</button>),
}))
vi.mock('./components/ShareMenu', () => ({
  ShareMenu: vi.fn(() => <button>Share puzzle</button>),
}))
vi.mock('./components/HintPanel', () => ({
  HintPanel: vi.fn(() => <div data-testid="hint-panel" />),
}))
vi.mock('./components/WinDialog', () => ({
  WinDialog: vi.fn(() => <div data-testid="win-dialog" />),
}))
vi.mock('./components/PendingPuzzleDialog', () => ({
  PendingPuzzleDialog: vi.fn(() => <div data-testid="pending-puzzle-dialog" />),
}))
vi.mock('./hooks/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: vi.fn() }))
vi.mock('./components/SelectionScreen', () => ({
  SelectionScreen: vi.fn(() => <div data-testid="selection-screen" />),
}))

const mockUseSudokuState = useSudokuState as Mock
const mockUseSudokuActions = useSudokuActions as Mock

describe('App component', () => {
  const mockEraseActiveCell = vi.fn()
  const defaultState: SudokuState = {
    ...initialState,
    solver: {
      ...initialState.solver,
      gameMode: 'playing',
    },
    ui: {
      ...initialState.ui,
      activeCellIndex: 5,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSudokuState.mockReturnValue(defaultState)
    mockUseSudokuActions.mockReturnValue({
      eraseActiveCell: mockEraseActiveCell,
    })
  })

  it('renders the main layout and all control components', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /wasudoku/i })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toHaveClass('relative z-30')
    expect(screen.getByTestId('sudoku-grid')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'NumberPad' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Puzzle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hint' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share puzzle' })).toBeInTheDocument()
    expect(screen.getByTestId('hint-panel')).toBeInTheDocument()
    expect(screen.getByTestId('win-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('pending-puzzle-dialog')).toBeInTheDocument()
    expect(useKeyboardShortcuts).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /github repository/i })).toBeInTheDocument()
  })

  it('replaces the hint with the solve control outside play', () => {
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      solver: { ...defaultState.solver, gameMode: 'customInput' },
    })
    render(<App />)
    expect(screen.queryByRole('button', { name: 'Hint' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Solve' })).toHaveLength(1)
  })

  it('disables the erase button while paused', () => {
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      ui: { ...defaultState.ui, isPaused: true },
    })
    render(<App />)
    expect(screen.getByRole('button', { name: 'Erase selected cell' })).toBeDisabled()
  })

  it('does not render the SolverStepsPanel in playing mode', () => {
    render(<App />)
    expect(screen.queryByTestId('solver-steps-panel')).not.toBeInTheDocument()
  })

  it('renders the SolverStepsPanel and scroll cue in visualizing mode', () => {
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      solver: {
        ...defaultState.solver,
        gameMode: 'visualizing',
      },
    })
    render(<App />)
    expect(screen.getByTestId('solver-steps-panel')).toBeInTheDocument()
    expect(screen.getByText('Scroll down for solving steps')).toBeInTheDocument()
  })

  it('calls eraseActiveCell when erase button is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)

    const eraseButton = screen.getByRole('button', {
      name: 'Erase selected cell',
    })
    await user.click(eraseButton)
    expect(mockEraseActiveCell).toHaveBeenCalledWith('delete')
  })

  it('disables erase button when no cell is active', () => {
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      ui: { ...initialState.ui, activeCellIndex: null },
    })
    render(<App />)
    expect(screen.getByRole('button', { name: 'Erase selected cell' })).toBeDisabled()
  })

  it('disables controls when not in an interactive mode', () => {
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      solver: { ...defaultState.solver, gameMode: 'visualizing' },
    })
    render(<App />)
    expect(screen.getByRole('button', { name: 'Erase selected cell' })).toBeDisabled()
  })

  it('renders SelectionScreen and dims main content when in selecting mode', () => {
    mockUseSudokuState.mockReturnValue({
      ...initialState, // gameMode is 'selecting' by default
    })
    render(<App />)
    expect(screen.getByTestId('selection-screen')).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveClass('opacity-35 pointer-events-none')
  })
})
