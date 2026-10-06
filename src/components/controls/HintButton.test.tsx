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

import { HintButton } from './HintButton'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

const mockUseSudokuState = useSudokuState as Mock
const mockUseSudokuActions = useSudokuActions as Mock

describe('HintButton component', () => {
  const mockRequestHint = vi.fn()
  const playing: SudokuState = {
    ...initialState,
    solver: { ...initialState.solver, gameMode: 'playing' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSudokuState.mockReturnValue(playing)
    mockUseSudokuActions.mockReturnValue({ requestHint: mockRequestHint })
  })

  it('requests a hint on click', async () => {
    const user = userEvent.setup()
    render(<HintButton />)
    await user.click(screen.getByRole('button', { name: 'Hint' }))
    expect(mockRequestHint).toHaveBeenCalledOnce()
  })

  it('shows a spinner while the hint is computed', () => {
    mockUseSudokuState.mockReturnValue({
      ...playing,
      solver: { ...playing.solver, isHinting: true },
    })
    render(<HintButton />)
    const button = screen.getByRole('button', { name: 'Hint' })
    expect(button).toBeDisabled()
    expect(button.querySelector('svg')).toHaveClass('animate-spin')
  })

  it.each([
    ['outside play', { ...playing, solver: { ...playing.solver, gameMode: 'customInput' } }],
    ['once solved', { ...playing, solver: { ...playing.solver, isSolved: true } }],
    ['while solving', { ...playing, solver: { ...playing.solver, isSolving: true } }],
    ['while paused', { ...playing, ui: { ...playing.ui, isPaused: true } }],
  ] as [string, SudokuState][])('is disabled %s', (_, state) => {
    mockUseSudokuState.mockReturnValue(state)
    render(<HintButton />)
    expect(screen.getByRole('button', { name: 'Hint' })).toBeDisabled()
  })
})
