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
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import { useSudokuState } from '@/context/sudoku.hooks'
import { initialState } from '@/context/sudoku.reducer'
import { useSudokuActions } from '@/hooks/useSudokuActions'

import { AutoFillButton } from './AutoFillButton'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))

const mockUseSudokuState = useSudokuState as Mock
const mockUseSudokuActions = useSudokuActions as Mock

describe('AutoFillButton component', () => {
  const mockAutoFillCandidates = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSudokuActions.mockReturnValue({ autoFillCandidates: mockAutoFillCandidates })
  })

  it('is disabled when not in playing mode', () => {
    mockUseSudokuState.mockReturnValue({
      ...initialState,
      solver: { ...initialState.solver, gameMode: 'selecting' },
    })
    render(<AutoFillButton />)
    expect(screen.getByRole('button', { name: 'Auto-fill pencil marks' })).toBeDisabled()
  })

  it('is disabled when solving', () => {
    mockUseSudokuState.mockReturnValue({
      ...initialState,
      solver: { ...initialState.solver, gameMode: 'playing', isSolving: true },
    })
    render(<AutoFillButton />)
    expect(screen.getByRole('button', { name: 'Auto-fill pencil marks' })).toBeDisabled()
  })

  it('is disabled when board is empty', () => {
    mockUseSudokuState.mockReturnValue({
      ...initialState,
      solver: { ...initialState.solver, gameMode: 'playing' },
      derived: { ...initialState.derived, isBoardEmpty: true },
    })
    render(<AutoFillButton />)
    expect(screen.getByRole('button', { name: 'Auto-fill pencil marks' })).toBeDisabled()
  })

  it('is enabled when board has values and is in playing mode', () => {
    mockUseSudokuState.mockReturnValue({
      ...initialState,
      solver: { ...initialState.solver, gameMode: 'playing' },
      derived: { ...initialState.derived, isBoardEmpty: false, isBoardFull: false },
    })
    render(<AutoFillButton />)
    expect(screen.getByRole('button', { name: 'Auto-fill pencil marks' })).toBeEnabled()
  })

  it('calls autoFillCandidates and shows toast on click', async () => {
    const user = userEvent.setup()
    mockUseSudokuState.mockReturnValue({
      ...initialState,
      solver: { ...initialState.solver, gameMode: 'playing' },
      derived: { ...initialState.derived, isBoardEmpty: false },
    })
    render(<AutoFillButton />)

    await user.click(screen.getByRole('button', { name: 'Auto-fill pencil marks' }))
    expect(mockAutoFillCandidates).toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith('Candidates auto-filled.')
  })
})
