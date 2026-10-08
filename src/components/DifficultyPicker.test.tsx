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

import { DifficultyPicker } from './DifficultyPicker'

vi.mock('@/context/sudoku.hooks')

describe('DifficultyPicker component', () => {
  const onSelect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSudoku({ state: makeState() })
  })

  it('passes the lower-cased difficulty to onSelect', async () => {
    const user = userEvent.setup()
    render(<DifficultyPicker onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: 'Extreme' }))
    expect(onSelect).toHaveBeenCalledWith('extreme')
  })

  it('disables every choice and marks the one being generated', () => {
    mockSudoku({
      state: makeState({ solver: { isGenerating: true, generationDifficulty: 'medium' } }),
    })
    render(<DifficultyPicker onSelect={onSelect} />)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
    }
    expect(screen.getByRole('button', { name: 'Medium' }).querySelector('svg')).toHaveClass(
      'animate-spin',
    )
    const easyIcon = screen.getByRole('button', { name: 'Easy' }).querySelector('svg')
    expect(easyIcon).toBeNull()
  })
})
