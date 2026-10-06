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

import { PendingPuzzleDialog } from './PendingPuzzleDialog'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

describe('PendingPuzzleDialog component', () => {
  const puzzle = '3'.repeat(81)
  const mockLoadPuzzle = vi.fn()
  const mockDismissPuzzle = vi.fn()
  const offered = makeState({ ui: { pendingPuzzle: puzzle } })

  beforeEach(() => {
    vi.clearAllMocks()
    mockSudoku({
      state: offered,
      actions: { loadPuzzle: mockLoadPuzzle, dismissPuzzle: mockDismissPuzzle },
    })
  })

  it('stays closed without an offered puzzle', () => {
    mockSudoku({ state: makeState() })
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
    mockSudoku({ state: makeState({ solver: { gameMode: 'playing' } }, offered) })
    render(<PendingPuzzleDialog />)
    expect(screen.getByText(/replaces the current board/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(mockDismissPuzzle).toHaveBeenCalledOnce()
    expect(mockLoadPuzzle).not.toHaveBeenCalled()
  })
})
