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

import { useSudokuState } from '@/context/sudoku.hooks'
import { initialState } from '@/context/sudoku.reducer'
import type { SudokuState } from '@/context/sudoku.types'
import { useSudokuActions } from '@/hooks/useSudokuActions'

import { WinDialog } from './WinDialog'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

const mockUseSudokuState = useSudokuState as Mock
const mockUseSudokuActions = useSudokuActions as Mock

describe('WinDialog component', () => {
  const mockGeneratePuzzle = vi.fn()
  const playing: SudokuState = {
    ...initialState,
    solver: { ...initialState.solver, gameMode: 'playing', difficulty: 'hard' },
    game: { timer: 754, mistakes: 1 },
  }
  const won: SudokuState = { ...playing, solver: { ...playing.solver, isSolved: true } }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSudokuState.mockReturnValue(won)
    mockUseSudokuActions.mockReturnValue({ generatePuzzle: mockGeneratePuzzle })
  })

  it('shows the time, difficulty and mistakes once the puzzle is solved', () => {
    render(<WinDialog />)
    expect(screen.getByRole('dialog', { name: 'Puzzle solved' })).toHaveAccessibleDescription(
      'Hard puzzle finished in 12:34 with 1 mistake.',
    )
  })

  it('names a custom puzzle and counts several mistakes', () => {
    mockUseSudokuState.mockReturnValue({
      ...won,
      solver: { ...won.solver, difficulty: null },
      game: { timer: 5, mistakes: 2 },
    })
    render(<WinDialog />)
    expect(screen.getByText('Custom puzzle finished in 00:05 with 2 mistakes.')).toBeInTheDocument()
  })

  it('starts another puzzle from the dialog', async () => {
    const user = userEvent.setup()
    render(<WinDialog />)
    await user.click(screen.getByRole('button', { name: 'Expert' }))
    expect(mockGeneratePuzzle).toHaveBeenCalledWith('expert')
  })

  it('stays closed after dismissal until the next win', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<WinDialog />)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(<WinDialog />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    mockUseSudokuState.mockReturnValue(playing)
    rerender(<WinDialog />)
    mockUseSudokuState.mockReturnValue(won)
    rerender(<WinDialog />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('is hidden while unsolved, while visualizing and while a puzzle is offered', () => {
    const { rerender } = render(<WinDialog />)
    for (const state of [
      playing,
      { ...won, solver: { ...won.solver, gameMode: 'visualizing' } },
      { ...won, ui: { ...won.ui, pendingPuzzle: '.'.repeat(81) } },
    ]) {
      mockUseSudokuState.mockReturnValue(state)
      rerender(<WinDialog />)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    }
  })
})
