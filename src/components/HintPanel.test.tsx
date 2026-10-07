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

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Hint, SudokuState } from '@/context/sudoku.types'
import { makeState, mockSudoku } from '@/test/sudoku-state'

import { HintPanel } from './HintPanel'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

const withHint = (hint: Hint | null, gameMode: SudokuState['solver']['gameMode'] = 'playing') =>
  makeState({ solver: { gameMode }, ui: { hint } })

describe('HintPanel component', () => {
  const mockClearHint = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSudoku({ actions: { clearHint: mockClearHint } })
  })

  it('keeps the strip closed without a hint or outside play', () => {
    mockSudoku({ state: withHint(null) })
    const { container, rerender } = render(<HintPanel />)
    const slot = container.firstElementChild!
    expect(slot).not.toHaveAttribute('data-open')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    mockSudoku({ state: withHint({ kind: 'mistake', index: 0 }, 'visualizing') })
    rerender(<HintPanel />)
    expect(slot).not.toHaveAttribute('data-open')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('opens with a hint and keeps it hidden while the strip closes', () => {
    mockSudoku({ state: withHint({ kind: 'mistake', index: 0 }) })
    const { container, rerender } = render(<HintPanel />)
    const slot = container.firstElementChild!
    expect(slot).toHaveAttribute('data-open')
    expect(screen.getByRole('status')).toHaveTextContent(/Check this cell/)

    mockSudoku({ state: withHint(null) })
    rerender(<HintPanel />)
    expect(slot).not.toHaveAttribute('data-open')
    expect(slot).toHaveAttribute('aria-hidden', 'true')
    expect(slot).toHaveAttribute('inert')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(slot).toHaveTextContent(/Check this cell/)

    fireEvent.transitionEnd(slot)
    expect(slot).toHaveTextContent(/^$/)
  })

  it('labels a step hint with its cell and technique, leaving the digit out', () => {
    mockSudoku({
      state: withHint({
        kind: 'step',
        step: {
          technique: 'HiddenSingle',
          placements: [{ index: 11, value: 4 }],
          eliminations: [],
          cause: [],
        },
      }),
    })
    render(<HintPanel />)
    expect(screen.getByText('Hint')).toBeInTheDocument()
    expect(screen.getByText('R2C3')).toBeInTheDocument()
    expect(screen.getByText('Hidden Single')).toBeInTheDocument()
    expect(screen.getByText(/the number 4 fits only in cell R2C3/)).toBeInTheDocument()
  })

  it('points an elimination hint at its pattern cells', () => {
    mockSudoku({
      state: withHint({
        kind: 'step',
        step: {
          technique: 'NakedPair',
          placements: [],
          eliminations: [{ index: 5, value: 4 }],
          cause: [
            { index: 1, candidates: [4, 6] },
            { index: 2, candidates: [4, 6] },
          ],
        },
      }),
    })
    render(<HintPanel />)
    expect(screen.getByText('R1C2 +1')).toBeInTheDocument()
    expect(screen.getByText('Naked Pair')).toBeInTheDocument()
  })

  it('labels a mistake hint and a revealed cell', () => {
    mockSudoku({ state: withHint({ kind: 'mistake', index: 0 }) })
    const { rerender } = render(<HintPanel />)
    expect(screen.getByRole('status')).toHaveTextContent(/^Hint R1C1 Check this cell/)

    mockSudoku({ state: withHint({ kind: 'reveal', index: 0, value: 3 }) })
    rerender(<HintPanel />)
    expect(screen.getByText('Reveal')).toBeInTheDocument()
    expect(screen.getByText(/Cell R1C1 is 3/)).toBeInTheDocument()
  })

  it('dismisses the hint', async () => {
    const user = userEvent.setup()
    mockSudoku({ state: withHint({ kind: 'mistake', index: 0 }) })
    render(<HintPanel />)
    await user.click(screen.getByRole('button', { name: 'Dismiss hint' }))
    expect(mockClearHint).toHaveBeenCalledOnce()
  })
})
