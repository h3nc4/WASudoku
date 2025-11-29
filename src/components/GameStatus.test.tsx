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
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { GameStatus } from './GameStatus'
import { useSudokuState } from '@/context/sudoku.hooks'
import { initialState } from '@/context/sudoku.reducer'
import type { SudokuState } from '@/context/sudoku.types'

vi.mock('@/context/sudoku.hooks')

const mockUseSudokuState = useSudokuState as Mock

describe('GameStatus component', () => {
  const playingState: SudokuState = {
    ...initialState,
    solver: { ...initialState.solver, gameMode: 'playing' },
    game: { timer: 0, mistakes: 0 },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSudokuState.mockReturnValue(playingState)
  })

  it('does not render when not in playing mode', () => {
    mockUseSudokuState.mockReturnValue({
      ...initialState,
      solver: { ...initialState.solver, gameMode: 'selecting' },
    })
    const { container } = render(<GameStatus />)
    expect(container.firstChild).toBeNull()
  })

  it('renders timer formatted correctly', () => {
    mockUseSudokuState.mockReturnValue({
      ...playingState,
      game: { timer: 65, mistakes: 0 },
    })
    render(<GameStatus />)
    expect(screen.getByText('01:05')).toBeInTheDocument()
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

  it('highlights mistakes in red when limit reached', () => {
    mockUseSudokuState.mockReturnValue({
      ...playingState,
      game: { timer: 0, mistakes: 3 },
    })
    render(<GameStatus />)
    const countElement = screen.getByText('3/3')
    expect(countElement).toHaveClass('text-red-500 font-bold')
  })
})
