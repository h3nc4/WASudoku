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
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import { useSudokuState } from '@/context/sudoku.hooks'
import { initialState } from '@/context/sudoku.reducer'
import type { SudokuState } from '@/context/sudoku.types'
import { useSudokuActions } from '@/hooks/useSudokuActions'

import { NewPuzzleButton } from './NewPuzzleButton'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

const mockUseSudokuState = useSudokuState as Mock
const mockUseSudokuActions = useSudokuActions as Mock

describe('NewPuzzleButton component', () => {
  const mockGeneratePuzzle = vi.fn()
  const mockStartCustomPuzzle = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSudokuState.mockReturnValue(initialState)
    mockUseSudokuActions.mockReturnValue({
      generatePuzzle: mockGeneratePuzzle,
      startCustomPuzzle: mockStartCustomPuzzle,
    })
  })

  it('renders a dropdown button with difficulty options', async () => {
    const user = userEvent.setup()
    render(<NewPuzzleButton />)

    const triggerButton = screen.getByRole('button', { name: 'New Puzzle' })
    await user.click(triggerButton)

    expect(await screen.findByRole('menuitem', { name: 'Easy' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Medium' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Hard' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'Extreme' })).toBeVisible()
  })

  it('calls generatePuzzle with the correct difficulty on item click', async () => {
    const user = userEvent.setup()
    render(<NewPuzzleButton />)
    await user.click(screen.getByRole('button', { name: 'New Puzzle' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Hard' }))
    expect(mockGeneratePuzzle).toHaveBeenCalledWith('hard')
  })

  it('is disabled while solving', () => {
    mockUseSudokuState.mockReturnValue({
      ...initialState,
      solver: { ...initialState.solver, isSolving: true },
    })
    render(<NewPuzzleButton />)
    expect(screen.getByRole('button', { name: 'New Puzzle' })).toBeDisabled()
  })

  it('shows and hides "Generating..." state correctly based on isGenerating prop', () => {
    vi.useFakeTimers()
    const generatingState: SudokuState = {
      ...initialState,
      solver: { ...initialState.solver, isGenerating: true },
    }
    const { rerender } = render(<NewPuzzleButton />)
    mockUseSudokuState.mockReturnValue(generatingState)
    rerender(<NewPuzzleButton />)

    expect(screen.queryByText('Generating...')).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(301)
    })
    expect(screen.getByText('Generating...')).toBeInTheDocument()

    mockUseSudokuState.mockReturnValue(initialState)
    rerender(<NewPuzzleButton />)

    expect(screen.queryByText('Generating...')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Puzzle' })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('shows the "Custom" option when not in selecting mode', async () => {
    mockUseSudokuState.mockReturnValue({
      ...initialState,
      solver: { ...initialState.solver, gameMode: 'playing' },
    })
    const user = userEvent.setup()
    render(<NewPuzzleButton />)
    await user.click(screen.getByRole('button', { name: 'New Puzzle' }))

    const customButton = await screen.findByRole('menuitem', { name: 'Custom' })
    expect(customButton).toBeVisible()

    await user.click(customButton)
    expect(mockStartCustomPuzzle).toHaveBeenCalledOnce()
  })

  it('hides the "Custom" option when in selecting mode', async () => {
    mockUseSudokuState.mockReturnValue({
      ...initialState,
      solver: { ...initialState.solver, gameMode: 'selecting' },
    })
    const user = userEvent.setup()
    render(<NewPuzzleButton />)
    await user.click(screen.getByRole('button', { name: 'New Puzzle' }))

    expect(await screen.findByRole('menuitem', { name: 'Easy' })).toBeVisible()
    expect(screen.queryByRole('menuitem', { name: 'Custom' })).not.toBeInTheDocument()
  })

  it('prevents default on mouse down for the trigger button', () => {
    render(<NewPuzzleButton />)
    const triggerButton = screen.getByRole('button', { name: 'New Puzzle' })

    const event = createEvent.pointerDown(triggerButton)
    event.preventDefault = vi.fn()

    fireEvent(triggerButton, event)

    expect(event.preventDefault).toHaveBeenCalled()
  })

  describe('with a game in progress', () => {
    const givens = initialState.board.map((c, i) =>
      i === 0 ? { ...c, value: 1, isGiven: true } : c,
    )
    const progress = givens.map((c, i) => (i === 1 ? { ...c, value: 2 } : c))
    const inProgress: SudokuState = {
      ...initialState,
      board: progress,
      initialBoard: givens,
      solver: { ...initialState.solver, gameMode: 'playing' },
    }

    it('asks before replacing the game and starts the puzzle on confirm', async () => {
      const user = userEvent.setup()
      mockUseSudokuState.mockReturnValue(inProgress)
      render(<NewPuzzleButton />)

      await user.click(screen.getByRole('button', { name: 'New Puzzle' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Hard' }))
      expect(mockGeneratePuzzle).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog', { name: 'Abandon current game?' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Start new puzzle' }))
      expect(mockGeneratePuzzle).toHaveBeenCalledWith('hard')
    })

    it('keeps the game when the confirmation is cancelled', async () => {
      const user = userEvent.setup()
      mockUseSudokuState.mockReturnValue(inProgress)
      render(<NewPuzzleButton />)

      await user.click(screen.getByRole('button', { name: 'New Puzzle' }))
      await user.click(await screen.findByRole('menuitem', { name: /Custom/ }))
      expect(screen.getByRole('button', { name: 'Create puzzle' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(mockStartCustomPuzzle).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('starts a custom puzzle after confirming', async () => {
      const user = userEvent.setup()
      mockUseSudokuState.mockReturnValue({
        ...initialState,
        solver: { ...initialState.solver, gameMode: 'customInput' },
        derived: { ...initialState.derived, isBoardEmpty: false },
      })
      render(<NewPuzzleButton />)

      await user.click(screen.getByRole('button', { name: 'New Puzzle' }))
      await user.click(await screen.findByRole('menuitem', { name: /Custom/ }))
      await user.click(screen.getByRole('button', { name: 'Create puzzle' }))
      expect(mockStartCustomPuzzle).toHaveBeenCalledOnce()
    })

    it('does not ask once the puzzle is solved', async () => {
      const user = userEvent.setup()
      mockUseSudokuState.mockReturnValue({
        ...inProgress,
        solver: { ...inProgress.solver, isSolved: true },
      })
      render(<NewPuzzleButton />)

      await user.click(screen.getByRole('button', { name: 'New Puzzle' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Easy' }))
      expect(mockGeneratePuzzle).toHaveBeenCalledWith('easy')
    })

    it('asks while visualizing a game that had progress', async () => {
      const user = userEvent.setup()
      mockUseSudokuState.mockReturnValue({
        ...inProgress,
        solver: { ...inProgress.solver, gameMode: 'visualizing', isSolved: true },
      })
      render(<NewPuzzleButton />)

      await user.click(screen.getByRole('button', { name: 'New Puzzle' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Easy' }))
      expect(mockGeneratePuzzle).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })
})
