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
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import { areBoardsEqual } from '@/lib/utils'
import { makeState, mockSudoku } from '@/test/sudoku-state'

import { ClearButton } from './ClearButton'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))
vi.mock('@/lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils')>()
  return { ...actual, areBoardsEqual: vi.fn() }
})

const mockAreBoardsEqual = areBoardsEqual as Mock

describe('ClearButton component', () => {
  const mockClearBoard = vi.fn()
  const mockUndo = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSudoku({ actions: { clearBoard: mockClearBoard, undo: mockUndo } })
    mockAreBoardsEqual.mockReturnValue(false) // Default to board not being pristine
  })

  it('is disabled when board is empty in customInput mode', () => {
    mockSudoku({
      state: makeState({ solver: { gameMode: 'customInput' }, derived: { isBoardEmpty: true } }),
    })
    render(<ClearButton />)
    const button = screen.getByRole('button', { name: 'Clear Board' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Board is already empty.')
  })

  it('is enabled when board is not empty in customInput mode', () => {
    mockSudoku({
      state: makeState({ solver: { gameMode: 'customInput' }, derived: { isBoardEmpty: false } }),
    })
    render(<ClearButton />)
    expect(screen.getByRole('button', { name: 'Clear Board' })).toBeEnabled()
  })

  it('is disabled in playing mode if board has no user progress', () => {
    mockAreBoardsEqual.mockReturnValue(true)
    mockSudoku({ state: makeState({ solver: { gameMode: 'playing' } }) })
    render(<ClearButton />)
    const button = screen.getByRole('button', { name: 'Clear Board' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'No progress to clear.')
  })

  it('is enabled in playing mode if board has user progress', () => {
    mockAreBoardsEqual.mockReturnValue(false)
    mockSudoku({ state: makeState({ solver: { gameMode: 'playing' } }) })
    render(<ClearButton />)
    expect(screen.getByRole('button', { name: 'Clear Board' })).toBeEnabled()
  })

  it('is disabled while paused, with progress to clear', () => {
    mockAreBoardsEqual.mockReturnValue(false)
    mockSudoku({ state: makeState({ solver: { gameMode: 'playing' }, ui: { isPaused: true } }) })
    render(<ClearButton />)
    expect(screen.getByRole('button', { name: 'Clear Board' })).toBeDisabled()
  })

  it('is disabled in selecting and visualizing modes', () => {
    mockSudoku({ state: makeState({ solver: { gameMode: 'selecting' } }) })
    const { rerender } = render(<ClearButton />)
    expect(screen.getByRole('button', { name: 'Clear Board' })).toBeDisabled()

    mockSudoku({ state: makeState({ solver: { gameMode: 'visualizing' } }) })
    rerender(<ClearButton />)
    expect(screen.getByRole('button', { name: 'Clear Board' })).toBeDisabled()
  })

  it('calls clearBoard and shows toast on click', async () => {
    const user = userEvent.setup()
    mockSudoku({
      state: makeState({ solver: { gameMode: 'customInput' }, derived: { isBoardEmpty: false } }),
    })
    render(<ClearButton />)

    await user.click(screen.getByRole('button', { name: 'Clear Board' }))
    expect(mockClearBoard).toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith('Board cleared.', {
      action: { label: 'Undo', onClick: mockUndo },
    })
  })
})
