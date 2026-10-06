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

import { useSudokuActions } from '@/hooks/useSudokuActions'

import { ShareMenu } from './ShareMenu'

vi.mock('@/hooks/useSudokuActions')

const mockUseSudokuActions = useSudokuActions as Mock

describe('ShareMenu component', () => {
  const mockSharePuzzleLink = vi.fn()
  const mockExportBoard = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSudokuActions.mockReturnValue({
      sharePuzzleLink: mockSharePuzzleLink,
      exportBoard: mockExportBoard,
    })
  })

  it('copies a puzzle link', async () => {
    const user = userEvent.setup()
    render(<ShareMenu />)
    await user.click(screen.getByRole('button', { name: 'Share puzzle' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Copy puzzle link' }))
    expect(mockSharePuzzleLink).toHaveBeenCalledOnce()
    expect(mockExportBoard).not.toHaveBeenCalled()
  })

  it('still copies the board as text', async () => {
    const user = userEvent.setup()
    render(<ShareMenu />)
    await user.click(screen.getByRole('button', { name: 'Share puzzle' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Copy board as text' }))
    expect(mockExportBoard).toHaveBeenCalledOnce()
  })
})
