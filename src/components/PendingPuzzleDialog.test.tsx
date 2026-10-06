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
import { useSudokuActions } from '@/hooks/useSudokuActions'

import { PendingPuzzleDialog } from './PendingPuzzleDialog'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

const mockUseSudokuState = useSudokuState as Mock
const mockUseSudokuActions = useSudokuActions as Mock

describe('PendingPuzzleDialog component', () => {
  const puzzle = '3'.repeat(81)
  const mockLoadPuzzle = vi.fn()
  const mockDismissPuzzle = vi.fn()
  const offered = { ...initialState, ui: { ...initialState.ui, pendingPuzzle: puzzle } }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSudokuState.mockReturnValue(offered)
    mockUseSudokuActions.mockReturnValue({
      loadPuzzle: mockLoadPuzzle,
      dismissPuzzle: mockDismissPuzzle,
    })
  })

  it('stays closed without an offered puzzle', () => {
    mockUseSudokuState.mockReturnValue(initialState)
    render(<PendingPuzzleDialog />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('starts the offered puzzle on confirm', async () => {
    const user = userEvent.setup()
    render(<PendingPuzzleDialog />)
    expect(screen.getByText(/checked for a unique solution/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start puzzle' }))
    expect(mockLoadPuzzle).toHaveBeenCalledWith(puzzle)
    expect(mockDismissPuzzle).toHaveBeenCalled()
  })

  it('warns that a game in progress is replaced, and dismisses on decline', async () => {
    const user = userEvent.setup()
    mockUseSudokuState.mockReturnValue({
      ...offered,
      solver: { ...offered.solver, gameMode: 'playing' },
    })
    render(<PendingPuzzleDialog />)
    expect(screen.getByText(/replaces the current board/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(mockDismissPuzzle).toHaveBeenCalledOnce()
    expect(mockLoadPuzzle).not.toHaveBeenCalled()
  })
})
