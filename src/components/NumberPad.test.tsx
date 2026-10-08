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

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSyncExternalStore } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSudokuState } from '@/context/sudoku.hooks'
import { createEmptyBoard, initialState } from '@/context/sudoku.reducer'
import type { SudokuState } from '@/context/sudoku.types'
import { makeState, mockSudoku } from '@/test/sudoku-state'

import { NumberPad } from './NumberPad'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

const playingState = makeState({ solver: { gameMode: 'playing' } })

describe('NumberPad component', () => {
  const mockInputValue = vi.fn()
  const mockSetHighlightedValue = vi.fn()
  const mockSetStickyValue = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSudoku({
      state: playingState,
      actions: {
        inputValue: mockInputValue,
        setHighlightedValue: mockSetHighlightedValue,
        setStickyValue: mockSetStickyValue,
      },
    })
  })

  it('renders 9 number buttons with their main number', () => {
    render(<NumberPad />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(9)

    for (let i = 1; i <= 9; i++) {
      const button = screen.getByRole('button', { name: `Enter number ${i}` })
      const mainNumber = within(button).getByText(String(i), {
        selector: 'span.text-xl',
      })
      expect(mainNumber).toBeInTheDocument()
      expect(mainNumber).toHaveClass('text-xl')
    }
  })

  it('calls inputValue and setHighlightedValue when a button is clicked', async () => {
    const user = userEvent.setup()
    render(<NumberPad />)

    const button5 = screen.getByRole('button', { name: 'Enter number 5' })
    await user.click(button5)

    expect(mockSetHighlightedValue).toHaveBeenCalledWith(5)
    expect(mockInputValue).toHaveBeenCalledWith(5)
  })

  describe('sticky numbers', () => {
    const sticky = (stickyValue: number | null) =>
      makeState({ ui: { sticky: true, stickyValue } }, playingState)

    it('leaves keys unpressable with the mode off', () => {
      render(<NumberPad />)
      expect(screen.getByRole('button', { name: 'Enter number 5' })).not.toHaveAttribute(
        'aria-pressed',
      )
    })

    it('locks the tapped digit instead of entering it', async () => {
      mockSudoku({ state: sticky(null) })
      render(<NumberPad />)
      const key = screen.getByRole('button', { name: 'Enter number 5' })
      expect(key).toHaveAttribute('aria-pressed', 'false')

      await userEvent.setup().click(key)
      expect(mockSetStickyValue).toHaveBeenCalledWith(5)
      expect(mockInputValue).not.toHaveBeenCalled()
      expect(mockSetHighlightedValue).not.toHaveBeenCalled()
    })

    it('draws the locked key pressed in filled ink', () => {
      mockSudoku({ state: sticky(5) })
      render(<NumberPad />)
      const key = screen.getByRole('button', { name: 'Enter number 5' })
      expect(key).toHaveAttribute('aria-pressed', 'true')
      expect(key).toHaveClass('bg-primary')
      expect(within(key).getByText('5')).toHaveClass('text-primary-foreground')
      expect(within(key).getByText('9')).toHaveClass('text-primary-foreground')
      const other = screen.getByRole('button', { name: 'Enter number 4' })
      expect(other).toHaveAttribute('aria-pressed', 'false')
      expect(within(other).getByText('4')).toHaveClass('text-ink')
    })

    it('switches the lock to another key and releases it on the locked key', async () => {
      mockSudoku({ state: sticky(5) })
      const user = userEvent.setup()
      render(<NumberPad />)
      await user.click(screen.getByRole('button', { name: 'Enter number 7' }))
      await user.click(screen.getByRole('button', { name: 'Enter number 5' }))
      expect(mockSetStickyValue.mock.calls).toEqual([[7], [null]])
    })
  })

  it('disables a number button if that number is on the board 9 times', () => {
    const fullBoard = createEmptyBoard().map(() => ({
      ...initialState.board[0],
      value: 3,
    }))
    const state = makeState({ board: fullBoard }, playingState)
    mockSudoku({ state })
    render(<NumberPad />)

    expect(screen.getByRole('button', { name: 'Enter number 3' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Enter number 4' })).toBeEnabled()
  })

  it('disables all number buttons when in visualizing mode', () => {
    const state = makeState({ solver: { gameMode: 'visualizing' } })
    mockSudoku({ state })
    render(<NumberPad />)

    for (let i = 1; i <= 9; i++) {
      expect(screen.getByRole('button', { name: `Enter number ${i}` })).toBeDisabled()
    }
  })

  it.each([
    ['while selecting', makeState()],
    ['while paused', makeState({ ui: { isPaused: true } }, playingState)],
    ['while solving', makeState({ solver: { isSolving: true } }, playingState)],
    [
      'while validating',
      makeState({ solver: { gameMode: 'customInput', isValidating: true } }, playingState),
    ],
  ] as [string, SudokuState][])(
    'disables all number buttons %s, as the grid is read-only',
    (_, state) => {
      mockSudoku({ state })
      render(<NumberPad />)

      for (let i = 1; i <= 9; i++) {
        expect(screen.getByRole('button', { name: `Enter number ${i}` })).toBeDisabled()
      }
    },
  )

  it('displays the remaining count for an incomplete number', () => {
    const partialBoard = createEmptyBoard().map((cell, i) => ({
      ...cell,
      value: i < 7 ? 3 : null,
    }))
    const state = makeState({ board: partialBoard }, playingState)
    mockSudoku({ state })
    render(<NumberPad />)

    const button3 = screen.getByRole('button', { name: 'Enter number 3' })
    const count = within(button3).getByText('2')
    expect(count).toBeInTheDocument()
    expect(count).toHaveClass('text-muted-foreground')
  })

  it('does not display a count for a complete number', () => {
    const fullBoard = createEmptyBoard().map(() => ({
      ...initialState.board[0],
      value: 3,
    }))
    const state = makeState({ board: fullBoard }, playingState)
    mockSudoku({ state })
    render(<NumberPad />)

    const button3 = screen.getByRole('button', { name: 'Enter number 3' })
    expect(button3).toBeDisabled()
    const counterSpan = button3.querySelector('span.absolute')
    expect(counterSpan).not.toBeInTheDocument()
  })

  it('strikes out a complete digit rather than fading it', () => {
    const fullBoard = createEmptyBoard().map(() => ({
      ...initialState.board[0],
      value: 3,
    }))
    mockSudoku({ state: makeState({ board: fullBoard }, playingState) })
    render(<NumberPad />)

    const digit = within(screen.getByRole('button', { name: 'Enter number 3' })).getByText('3')
    expect(digit).toHaveAttribute('data-struck')
    expect(digit).toHaveClass('pad-strike', 'text-disabled-foreground')
    const open = within(screen.getByRole('button', { name: 'Enter number 4' })).getByText('4')
    expect(open).toHaveClass('text-ink')
    expect(open).not.toHaveAttribute('data-struck')
  })

  describe('strike animation', () => {
    // Nine 3s, the first `givens` of them given and the rest placed by the player.
    const threes = (placed: number, givens = 0) =>
      createEmptyBoard().map((cell, i) => ({
        ...cell,
        value: i < placed ? 3 : null,
        isGiven: i < givens,
      }))
    const digitThree = () =>
      within(screen.getByRole('button', { name: 'Enter number 3' })).getByText('3')

    // The pad is memoised. A subscription delivers board changes to it the way context does.
    let state = playingState
    const listeners = new Set<() => void>()
    const show = (board: ReturnType<typeof threes>) =>
      act(() => {
        state = makeState({ board }, playingState)
        listeners.forEach((notify) => notify())
      })

    beforeEach(() => {
      vi.mocked(useSudokuState).mockImplementation(() =>
        useSyncExternalStore(
          (notify) => {
            listeners.add(notify)
            return () => listeners.delete(notify)
          },
          () => state,
        ),
      )
    })

    it('draws the strike in when a digit is completed during play', () => {
      show(threes(8, 4))
      render(<NumberPad />)
      expect(digitThree()).toHaveAttribute('data-armed')
      expect(digitThree()).not.toHaveAttribute('data-struck')

      show(threes(9, 4))
      expect(digitThree()).toHaveAttribute('data-struck')
      expect(digitThree()).toHaveAttribute('data-armed')
    })

    it('strikes at once a digit already complete when the pad mounts', () => {
      show(threes(9, 4))
      render(<NumberPad />)
      expect(digitThree()).toHaveAttribute('data-struck')
      expect(digitThree()).not.toHaveAttribute('data-armed')
    })

    it('strikes at once a digit a new puzzle starts with complete', () => {
      show(threes(8, 4))
      render(<NumberPad />)
      expect(digitThree()).toHaveAttribute('data-armed')

      show(threes(9, 9))
      expect(digitThree()).toHaveAttribute('data-struck')
      expect(digitThree()).not.toHaveAttribute('data-armed')
    })

    it('arms a digit restored complete once it has been open in that puzzle', () => {
      show(threes(9, 4))
      render(<NumberPad />)
      show(threes(8, 4))
      show(threes(9, 4))
      expect(digitThree()).toHaveAttribute('data-struck')
      expect(digitThree()).toHaveAttribute('data-armed')
    })
  })

  it('greys the digits of a read-only pad without striking them', () => {
    mockSudoku({ state: makeState({ ui: { isPaused: true } }, playingState) })
    render(<NumberPad />)

    const digit = within(screen.getByRole('button', { name: 'Enter number 4' })).getByText('4')
    expect(digit).toHaveClass('text-disabled-foreground')
    expect(digit).not.toHaveAttribute('data-struck')
  })
})
