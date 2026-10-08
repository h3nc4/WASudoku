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

import { StickyToggle } from './StickyToggle'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

const playing = makeState({ solver: { gameMode: 'playing' } })

describe('StickyToggle', () => {
  const toggleSticky = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSudoku({ state: playing, actions: { toggleSticky } })
  })

  const button = () => screen.getByRole('button', { name: 'Sticky numbers' })

  it('reads as an unpressed toggle with the mode off', () => {
    render(<StickyToggle />)
    expect(button()).toHaveAttribute('aria-pressed', 'false')
    expect(button()).toHaveAttribute('title', 'Sticky numbers')
    expect(button()).toHaveClass('bg-paper')
    expect(button().querySelector('.lucide-lock-open')).not.toBeNull()
  })

  it('reads as pressed in filled ink with the mode on', () => {
    mockSudoku({ state: makeState({ ui: { sticky: true } }, playing) })
    render(<StickyToggle />)
    expect(button()).toHaveAttribute('aria-pressed', 'true')
    expect(button()).toHaveClass('bg-primary')
    expect(button().querySelector('.lucide-lock')).not.toBeNull()
  })

  it('toggles the mode on click', async () => {
    render(<StickyToggle />)
    await userEvent.setup().click(button())
    expect(toggleSticky).toHaveBeenCalledOnce()
  })

  it('keeps focus where it was on press', () => {
    render(<StickyToggle />)
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    button().dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it.each([
    ['in the walkthrough', makeState({ solver: { gameMode: 'visualizing' } })],
    ['while paused', makeState({ ui: { isPaused: true } }, playing)],
    ['while solving', makeState({ solver: { isSolving: true } }, playing)],
  ] as [string, SudokuState][])('is disabled %s', (_, state) => {
    mockSudoku({ state })
    render(<StickyToggle />)
    expect(button()).toBeDisabled()
  })
})
