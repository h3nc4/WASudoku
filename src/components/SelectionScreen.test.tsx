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
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeState, mockSudoku } from '@/test/sudoku-state'

import { SelectionScreen } from './SelectionScreen'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

describe('SelectionScreen component', () => {
  const mockStartCustomPuzzle = vi.fn()
  const mockGeneratePuzzle = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSudoku({
      state: makeState(),
      actions: { startCustomPuzzle: mockStartCustomPuzzle, generatePuzzle: mockGeneratePuzzle },
    })
  })

  it('renders the welcome message, every difficulty and the custom option', () => {
    render(<SelectionScreen />)
    expect(screen.getByRole('heading', { name: /welcome to wasudoku/i })).toBeInTheDocument()
    for (const level of ['Easy', 'Medium', 'Hard', 'Expert', 'Extreme']) {
      expect(screen.getByRole('button', { name: level })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: /create your own/i })).toBeInTheDocument()
  })

  it('starts a puzzle with a single tap on a difficulty', async () => {
    const user = userEvent.setup()
    render(<SelectionScreen />)

    await user.click(screen.getByRole('button', { name: 'Hard' }))
    expect(mockGeneratePuzzle).toHaveBeenCalledWith('hard')
  })

  it('calls startCustomPuzzle when the "Create Your Own" button is clicked', async () => {
    const user = userEvent.setup()
    render(<SelectionScreen />)

    const createButton = screen.getByRole('button', { name: /create your own/i })
    await user.click(createButton)

    expect(mockStartCustomPuzzle).toHaveBeenCalledOnce()
  })
})
