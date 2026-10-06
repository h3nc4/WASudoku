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

import { ShareMenu } from './ShareMenu'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

const mockUseSudokuState = useSudokuState as Mock
const mockUseSudokuActions = useSudokuActions as Mock

describe('ShareMenu component', () => {
  const mockSharePuzzleLink = vi.fn()
  const mockExportBoard = vi.fn()
  const givens = initialState.board.map((cell, index) =>
    index === 0 ? { ...cell, value: 5, isGiven: true } : cell,
  )
  const progress = givens.map((cell, index) => (index === 1 ? { ...cell, value: 3 } : cell))
  const playing: SudokuState = {
    ...initialState,
    initialBoard: givens,
    board: progress,
    solver: { ...initialState.solver, gameMode: 'playing' },
  }

  const choose = async (name: string) => {
    const user = userEvent.setup()
    render(<ShareMenu />)
    await user.click(screen.getByRole('button', { name: 'Share puzzle' }))
    await user.click(await screen.findByRole('menuitem', { name }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSudokuState.mockReturnValue(playing)
    mockUseSudokuActions.mockReturnValue({
      sharePuzzleLink: mockSharePuzzleLink,
      exportBoard: mockExportBoard,
    })
  })

  it('copies a link to the puzzle without the player progress', async () => {
    await choose('Copy puzzle link')
    expect(mockSharePuzzleLink).toHaveBeenCalledExactlyOnceWith(givens)
    expect(mockExportBoard).not.toHaveBeenCalled()
  })

  it('shares the board being typed in customInput mode', async () => {
    mockUseSudokuState.mockReturnValue({
      ...playing,
      solver: { ...playing.solver, gameMode: 'customInput' },
    })
    await choose('Copy puzzle link')
    expect(mockSharePuzzleLink).toHaveBeenCalledExactlyOnceWith(progress)
  })

  it('still copies the board as text', async () => {
    await choose('Copy board as text')
    expect(mockExportBoard).toHaveBeenCalledExactlyOnceWith(progress)
  })
})
