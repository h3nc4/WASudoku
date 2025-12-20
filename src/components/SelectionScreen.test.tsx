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

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import { useSudokuActions } from '@/hooks/useSudokuActions'

import { SelectionScreen } from './SelectionScreen'

vi.mock('@/hooks/useSudokuActions')
vi.mock('./controls/NewPuzzleButton', () => ({
  NewPuzzleButton: vi.fn(() => <button>New Puzzle</button>),
}))

const mockUseSudokuActions = useSudokuActions as Mock

describe('SelectionScreen component', () => {
  const mockStartCustomPuzzle = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSudokuActions.mockReturnValue({
      startCustomPuzzle: mockStartCustomPuzzle,
    })
  })

  it('renders the welcome message and control buttons', () => {
    render(<SelectionScreen />)
    expect(screen.getByRole('heading', { name: /welcome to wasudoku/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Puzzle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create your own/i })).toBeInTheDocument()
  })

  it('calls startCustomPuzzle when the "Create Your Own" button is clicked', async () => {
    const user = userEvent.setup()
    render(<SelectionScreen />)

    const createButton = screen.getByRole('button', { name: /create your own/i })
    await user.click(createButton)

    expect(mockStartCustomPuzzle).toHaveBeenCalledOnce()
  })
})
