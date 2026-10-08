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

import type { SudokuState } from '@/context/sudoku.types'
import { makeState, mockSudoku } from '@/test/sudoku-state'

import { HintButton } from './HintButton'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

describe('HintButton component', () => {
  const mockRequestHint = vi.fn()
  const playing = makeState({ solver: { gameMode: 'playing' } })

  beforeEach(() => {
    vi.clearAllMocks()
    mockSudoku({ state: playing, actions: { requestHint: mockRequestHint } })
  })

  it('requests a hint on click', async () => {
    const user = userEvent.setup()
    render(<HintButton />)
    await user.click(screen.getByRole('button', { name: 'Hint' }))
    expect(mockRequestHint).toHaveBeenCalledOnce()
  })

  it('shows a spinner while the hint is computed', () => {
    mockSudoku({ state: makeState({ solver: { isHinting: true } }, playing) })
    render(<HintButton />)
    const button = screen.getByRole('button', { name: 'Hint' })
    expect(button).toBeDisabled()
    expect(button.querySelector('svg')).toHaveClass('animate-spin')
  })

  it.each([
    ['outside play', makeState({ solver: { gameMode: 'customInput' } }, playing)],
    ['once solved', makeState({ solver: { isSolved: true } }, playing)],
    ['while solving', makeState({ solver: { isSolving: true } }, playing)],
    ['while paused', makeState({ ui: { isPaused: true } }, playing)],
  ] as [string, SudokuState][])('is disabled %s', (_, state) => {
    mockSudoku({ state })
    render(<HintButton />)
    expect(screen.getByRole('button', { name: 'Hint' })).toBeDisabled()
  })
})
