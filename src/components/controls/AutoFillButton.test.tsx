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
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeState, mockSudoku } from '@/test/sudoku-state'

import { AutoFillButton } from './AutoFillButton'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))

describe('AutoFillButton component', () => {
  const mockAutoFillCandidates = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSudoku({ actions: { autoFillCandidates: mockAutoFillCandidates } })
  })

  it('is disabled when not in playing mode', () => {
    mockSudoku({ state: makeState({ solver: { gameMode: 'selecting' } }) })
    render(<AutoFillButton />)
    expect(screen.getByRole('button', { name: 'Auto-fill pencil marks' })).toBeDisabled()
  })

  it('is disabled when solving', () => {
    mockSudoku({ state: makeState({ solver: { gameMode: 'playing', isSolving: true } }) })
    render(<AutoFillButton />)
    expect(screen.getByRole('button', { name: 'Auto-fill pencil marks' })).toBeDisabled()
  })

  it('is disabled when board is empty', () => {
    mockSudoku({
      state: makeState({ solver: { gameMode: 'playing' }, derived: { isBoardEmpty: true } }),
    })
    render(<AutoFillButton />)
    expect(screen.getByRole('button', { name: 'Auto-fill pencil marks' })).toBeDisabled()
  })

  it('is enabled when board has values and is in playing mode', () => {
    mockSudoku({
      state: makeState({
        solver: { gameMode: 'playing' },
        derived: { isBoardEmpty: false, isBoardFull: false },
      }),
    })
    render(<AutoFillButton />)
    expect(screen.getByRole('button', { name: 'Auto-fill pencil marks' })).toBeEnabled()
  })

  it('is disabled while paused, like the rest of the board controls', () => {
    mockSudoku({
      state: makeState({
        solver: { gameMode: 'playing' },
        derived: { isBoardEmpty: false, isBoardFull: false },
        ui: { isPaused: true },
      }),
    })
    render(<AutoFillButton />)
    expect(screen.getByRole('button', { name: 'Auto-fill pencil marks' })).toBeDisabled()
  })

  it('calls autoFillCandidates and shows toast on click', async () => {
    const user = userEvent.setup()
    mockSudoku({
      state: makeState({ solver: { gameMode: 'playing' }, derived: { isBoardEmpty: false } }),
    })
    render(<AutoFillButton />)

    await user.click(screen.getByRole('button', { name: 'Auto-fill pencil marks' }))
    expect(mockAutoFillCandidates).toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith('Candidates auto-filled.')
  })
})
