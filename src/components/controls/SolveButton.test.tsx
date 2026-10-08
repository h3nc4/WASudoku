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

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { initialState } from '@/context/sudoku.reducer'
import { makeState, mockSudoku } from '@/test/sudoku-state'

import { SolveButton } from './SolveButton'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

describe('SolveButton component', () => {
  const mockSolve = vi.fn()
  const mockExitVisualization = vi.fn()
  const mockValidatePuzzle = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSudoku({
      state: initialState,
      actions: {
        solve: mockSolve,
        exitVisualization: mockExitVisualization,
        validatePuzzle: mockValidatePuzzle,
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('in "playing" mode', () => {
    it('is disabled and has correct title when board is empty', () => {
      mockSudoku({ state: makeState({ derived: { isBoardEmpty: true } }) })
      render(<SolveButton />)
      const button = screen.getByRole('button', { name: 'Solve' })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', 'Board is empty.')
    })

    it('is enabled when board has values and no conflicts', () => {
      mockSudoku({ state: makeState({ derived: { isBoardEmpty: false, conflicts: new Set() } }) })
      render(<SolveButton />)
      expect(screen.getByRole('button', { name: 'Solve' })).toBeEnabled()
    })

    it('is disabled and shows conflict title when there are conflicts', () => {
      mockSudoku({
        state: makeState({ derived: { isBoardEmpty: false, conflicts: new Set([0, 1]) } }),
      })
      render(<SolveButton />)
      const button = screen.getByRole('button', { name: 'Solve' })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', 'Cannot solve with conflicts.')
    })

    it('is disabled and shows correct title when board is full', () => {
      mockSudoku({ state: makeState({ derived: { isBoardFull: true } }) })
      render(<SolveButton />)
      const button = screen.getByRole('button', { name: 'Solve' })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', 'Board is already full.')
    })

    it('is disabled and shows correct title when solve has failed', () => {
      mockSudoku({
        state: makeState({ derived: { isBoardEmpty: false }, solver: { solveFailed: true } }),
      })
      render(<SolveButton />)
      const button = screen.getByRole('button', { name: 'Solve' })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute(
        'title',
        'Solving failed. Please change the board to try again.',
      )
    })

    it('calls solve on click when valid', async () => {
      const user = userEvent.setup()
      mockSudoku({ state: makeState({ derived: { isBoardEmpty: false, conflicts: new Set() } }) })
      render(<SolveButton />)

      await user.click(screen.getByRole('button', { name: 'Solve' }))
      expect(mockSolve).toHaveBeenCalled()
    })

    it('asks for confirmation before revealing the solution during play', async () => {
      const user = userEvent.setup()
      mockSudoku({
        state: makeState({ derived: { isBoardEmpty: false }, solver: { gameMode: 'playing' } }),
      })
      render(<SolveButton />)

      await user.click(screen.getByRole('button', { name: 'Solve' }))
      expect(mockSolve).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog', { name: 'Reveal the solution?' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Reveal solution' }))
      expect(mockSolve).toHaveBeenCalledOnce()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does not solve when the confirmation is cancelled', async () => {
      const user = userEvent.setup()
      mockSudoku({
        state: makeState({ derived: { isBoardEmpty: false }, solver: { gameMode: 'playing' } }),
      })
      render(<SolveButton />)

      await user.click(screen.getByRole('button', { name: 'Solve' }))
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(mockSolve).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('is disabled once the puzzle is solved, while a hint runs, or while paused', () => {
      const base = makeState({ derived: { isBoardEmpty: false } })
      const { rerender } = render(<SolveButton />)
      for (const state of [
        makeState({ solver: { gameMode: 'playing', isSolved: true } }, base),
        makeState({ solver: { isHinting: true } }, base),
        makeState({ ui: { isPaused: true } }, base),
      ]) {
        mockSudoku({ state })
        rerender(<SolveButton />)
        expect(screen.getByRole('button', { name: 'Solve' })).toBeDisabled()
      }
    })

    it('shows no guiding tooltip', () => {
      mockSudoku({
        state: makeState({ derived: { isBoardEmpty: false }, solver: { gameMode: 'playing' } }),
      })
      render(<SolveButton />)
      expect(screen.queryByText(/Click me!/i)).not.toBeInTheDocument()
    })

    it('shows and hides "Solving..." state correctly based on isSolving prop', () => {
      vi.useFakeTimers()
      const solvingState = makeState({ solver: { isSolving: true } })

      const { rerender } = render(<SolveButton />)
      mockSudoku({ state: solvingState })

      // Rerender with isSolving = true
      rerender(<SolveButton />)

      // Should not be visible immediately
      expect(screen.queryByText('Solving...')).not.toBeInTheDocument()

      // Becomes visible after the delay
      act(() => {
        vi.advanceTimersByTime(501)
      })
      expect(screen.getByText('Solving...')).toBeInTheDocument()

      // Rerender with isSolving = false, which should trigger the cleanup
      mockSudoku({ state: initialState })
      rerender(<SolveButton />)

      // Should disappear immediately
      expect(screen.queryByText('Solving...')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Solve' })).toBeInTheDocument()

      vi.useRealTimers()
    })
  })

  describe('in "visualizing" mode', () => {
    const visualizingState = makeState({ solver: { gameMode: 'visualizing' } })

    it('renders an "Exit Visualization" button', () => {
      mockSudoku({ state: visualizingState })
      render(<SolveButton />)
      expect(screen.getByRole('button', { name: /exit visualization/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^solve$/i })).not.toBeInTheDocument()
    })

    it('calls exitVisualization on click', async () => {
      const user = userEvent.setup()
      mockSudoku({ state: visualizingState })
      render(<SolveButton />)
      await user.click(screen.getByRole('button', { name: /exit visualization/i }))
      expect(mockExitVisualization).toHaveBeenCalled()
    })
  })

  describe('in "customInput" mode', () => {
    const customInputState = makeState({
      solver: { gameMode: 'customInput' },
      derived: { isBoardEmpty: false },
    })

    it('renders a "Start Puzzle" button', () => {
      mockSudoku({ state: customInputState })
      render(<SolveButton />)
      expect(screen.getByRole('button', { name: /start puzzle/i })).toBeInTheDocument()
    })

    it('is disabled if the board is empty', () => {
      mockSudoku({ state: makeState({ derived: { isBoardEmpty: true } }, customInputState) })
      render(<SolveButton />)
      const button = screen.getByRole('button', { name: /start puzzle/i })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', 'Board is empty.')
    })

    it('calls validatePuzzle on click', async () => {
      const user = userEvent.setup()
      mockSudoku({ state: customInputState })
      render(<SolveButton />)
      await user.click(screen.getByRole('button', { name: /start puzzle/i }))
      expect(mockValidatePuzzle).toHaveBeenCalled()
    })

    it('renders "Validating..." when isValidating is true', () => {
      mockSudoku({ state: makeState({ solver: { isValidating: true } }, customInputState) })
      render(<SolveButton />)
      const button = screen.getByRole('button', { name: /validating/i })
      expect(button).toBeInTheDocument()
      expect(button).toBeDisabled()
    })
  })
})
