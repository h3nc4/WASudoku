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

import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { initialState } from '@/context/sudoku.reducer'
import { makeState, mockSudoku } from '@/test/sudoku-state'

import { InputModeToggle } from './InputModeToggle'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

describe('InputModeToggle component', () => {
  const mockSetInputMode = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // The initial input mode is 'normal'
    mockSudoku({ state: initialState, actions: { setInputMode: mockSetInputMode } })
  })

  it('renders with the correct initial mode selected', () => {
    render(<InputModeToggle />)
    const penButton = screen.getByRole('radio', { name: 'Pen' })
    expect(penButton).toBeChecked()
  })

  it('sets inactive modes in the foreground colour and the active one heavier', () => {
    render(<InputModeToggle />)

    expect(screen.getByRole('radio', { name: 'Corner' })).toHaveClass(
      'text-foreground',
      'font-normal',
    )
    expect(screen.getByRole('radio', { name: 'Pen' })).toHaveAttribute('data-state', 'on')
    expect(screen.getByRole('radio', { name: 'Pen' })).toHaveClass('data-[state=on]:font-semibold')
  })

  it('calls setInputMode when a different mode is selected', async () => {
    const user = userEvent.setup()
    render(<InputModeToggle />)

    const cornerButton = screen.getByRole('radio', { name: 'Corner' })
    await user.click(cornerButton)

    expect(mockSetInputMode).toHaveBeenCalledWith('candidate')
  })

  it('does not call setInputMode if the onValueChange callback receives an empty value', async () => {
    const user = userEvent.setup()
    // Start with a mode selected
    mockSudoku({ state: makeState({ ui: { inputMode: 'candidate' } }) })
    render(<InputModeToggle />)

    const cornerButton = screen.getByRole('radio', { name: 'Corner' })
    await user.click(cornerButton)

    expect(mockSetInputMode).not.toHaveBeenCalled()
  })

  it('is disabled when in visualizing mode', () => {
    mockSudoku({ state: makeState({ solver: { gameMode: 'visualizing' } }) })
    render(<InputModeToggle />)

    // Check that the individual buttons inside the group are disabled.
    screen.getAllByRole('radio').forEach((button) => {
      expect(button).toBeDisabled()
    })
  })

  it('prevents default on mouse down for all toggle items', () => {
    render(<InputModeToggle />)
    const buttons = screen.getAllByRole('radio')

    expect(buttons).toHaveLength(3)

    buttons.forEach((button) => {
      const event = createEvent.mouseDown(button)
      event.preventDefault = vi.fn()
      fireEvent(button, event)
      expect(event.preventDefault).toHaveBeenCalled()
    })
  })
})
