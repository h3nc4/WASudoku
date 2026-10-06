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

import { GameStatus } from './GameStatus'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

const mockUseSudokuState = useSudokuState as Mock
const mockUseSudokuActions = useSudokuActions as Mock

describe('GameStatus component', () => {
  const playingState: SudokuState = {
    ...initialState,
    solver: { ...initialState.solver, gameMode: 'playing' },
    game: { timer: 0, mistakes: 0 },
  }

  const mockPauseGame = vi.fn()
  const mockResumeGame = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSudokuState.mockReturnValue(playingState)
    mockUseSudokuActions.mockReturnValue({ pauseGame: mockPauseGame, resumeGame: mockResumeGame })
  })

  it('does not render when not in playing mode', () => {
    mockUseSudokuState.mockReturnValue({
      ...initialState,
      solver: { ...initialState.solver, gameMode: 'selecting' },
    })
    const { container } = render(<GameStatus />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders timer formatted correctly', () => {
    mockUseSudokuState.mockReturnValue({
      ...playingState,
      game: { timer: 65, mistakes: 0 },
    })
    render(<GameStatus />)
    expect(screen.getByText('01:05')).toBeInTheDocument()
  })

  it('renders the difficulty, or Custom for a custom puzzle', () => {
    mockUseSudokuState.mockReturnValue({
      ...playingState,
      solver: { ...playingState.solver, difficulty: 'medium' },
    })
    const { rerender } = render(<GameStatus />)
    expect(screen.getByText('Medium')).toBeInTheDocument()

    mockUseSudokuState.mockReturnValue(playingState)
    rerender(<GameStatus />)
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('renders mistakes count', () => {
    mockUseSudokuState.mockReturnValue({
      ...playingState,
      game: { timer: 0, mistakes: 2 },
    })
    render(<GameStatus />)
    expect(screen.getByText('Mistakes:')).toBeInTheDocument()
    expect(screen.getByText('2/3')).toBeInTheDocument()
  })

  it('highlights mistakes in the error colour when limit reached', () => {
    mockUseSudokuState.mockReturnValue({
      ...playingState,
      game: { timer: 0, mistakes: 3 },
    })
    render(<GameStatus />)
    const countElement = screen.getByText('3/3')
    expect(countElement).toHaveClass('text-error font-bold')
  })

  it('pauses and resumes the game', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<GameStatus />)
    await user.click(screen.getByRole('button', { name: 'Pause game' }))
    expect(mockPauseGame).toHaveBeenCalledOnce()

    mockUseSudokuState.mockReturnValue({
      ...playingState,
      ui: { ...playingState.ui, isPaused: true },
    })
    rerender(<GameStatus />)
    await user.click(screen.getByRole('button', { name: 'Resume game' }))
    expect(mockResumeGame).toHaveBeenCalledOnce()
  })

  it('shows a solved label instead of the pause control once won', () => {
    mockUseSudokuState.mockReturnValue({
      ...playingState,
      solver: { ...playingState.solver, isSolved: true },
    })
    render(<GameStatus />)
    expect(screen.getByText('Solved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause game' })).not.toBeInTheDocument()
  })
})
