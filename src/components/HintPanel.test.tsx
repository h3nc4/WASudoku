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
import type { Hint, SudokuState } from '@/context/sudoku.types'
import { useSudokuActions } from '@/hooks/useSudokuActions'

import { HintPanel } from './HintPanel'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

const mockUseSudokuState = useSudokuState as Mock
const mockUseSudokuActions = useSudokuActions as Mock

const withHint = (hint: Hint | null, gameMode: SudokuState['solver']['gameMode'] = 'playing') => ({
  ...initialState,
  solver: { ...initialState.solver, gameMode },
  ui: { ...initialState.ui, hint },
})

describe('HintPanel component', () => {
  const mockClearHint = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSudokuActions.mockReturnValue({ clearHint: mockClearHint })
  })

  it('renders nothing without a hint or outside play', () => {
    mockUseSudokuState.mockReturnValue(withHint(null))
    const { container, rerender } = render(<HintPanel />)
    expect(container).toBeEmptyDOMElement()

    mockUseSudokuState.mockReturnValue(withHint({ kind: 'mistake', index: 0 }, 'visualizing'))
    rerender(<HintPanel />)
    expect(container).toBeEmptyDOMElement()
  })

  it('titles a step hint with the technique name', () => {
    mockUseSudokuState.mockReturnValue(
      withHint({
        kind: 'step',
        step: {
          technique: 'HiddenSingle',
          placements: [{ index: 0, value: 4 }],
          eliminations: [],
          cause: [],
        },
      }),
    )
    render(<HintPanel />)
    expect(screen.getByText('Hidden Single')).toBeInTheDocument()
    expect(screen.getByText(/the number 4 fits only in cell R1C1/)).toBeInTheDocument()
  })

  it('titles a mistake hint and a revealed cell', () => {
    mockUseSudokuState.mockReturnValue(withHint({ kind: 'mistake', index: 0 }))
    const { rerender } = render(<HintPanel />)
    expect(screen.getByText('Check this cell')).toBeInTheDocument()

    mockUseSudokuState.mockReturnValue(withHint({ kind: 'reveal', index: 0, value: 3 }))
    rerender(<HintPanel />)
    expect(screen.getByText('Hint')).toBeInTheDocument()
    expect(screen.getByText(/Cell R1C1 is 3/)).toBeInTheDocument()
  })

  it('dismisses the hint', async () => {
    const user = userEvent.setup()
    mockUseSudokuState.mockReturnValue(withHint({ kind: 'mistake', index: 0 }))
    render(<HintPanel />)
    await user.click(screen.getByRole('button', { name: 'Dismiss hint' }))
    expect(mockClearHint).toHaveBeenCalledOnce()
  })
})
