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

import { initialState } from '@/context/sudoku.reducer'
import { makeState, mockSudoku, type StatePatch } from '@/test/sudoku-state'

import { UndoRedo } from './UndoRedo'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

const playingState = makeState({ solver: { gameMode: 'playing' } })

describe('UndoRedo component', () => {
  const mockUndo = vi.fn()
  const mockRedo = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSudoku({ state: playingState, actions: { undo: mockUndo, redo: mockRedo } })
  })

  it('disables both buttons with initial state', () => {
    render(<UndoRedo />)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it('enables Undo button when history.index > 0', () => {
    mockSudoku({
      state: makeState(
        { history: { index: 1, stack: [initialState.board, initialState.board] } }, // 2 states
        playingState,
      ),
    })
    render(<UndoRedo />)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it('enables Redo button when not at the end of history', () => {
    mockSudoku({
      state: makeState(
        { history: { index: 0, stack: [initialState.board, initialState.board] } }, // 2 states
        playingState,
      ),
    })
    render(<UndoRedo />)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled()
  })

  it('disables both buttons when in visualizing mode, even if history exists', () => {
    const state = makeState(
      {
        history: {
          index: 1,
          stack: [initialState.board, initialState.board, initialState.board],
        },
        solver: { gameMode: 'visualizing' },
      },
      playingState,
    )
    mockSudoku({ state })
    render(<UndoRedo />)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it.each([
    ['while paused', { ui: { isPaused: true } }],
    ['while solving', { solver: { gameMode: 'playing', isSolving: true } }],
    ['while validating', { solver: { gameMode: 'customInput', isValidating: true } }],
    ['while selecting', { solver: { gameMode: 'selecting' } }],
  ] as [string, StatePatch][])('disables both buttons %s, like the shortcuts', (_, patch) => {
    mockSudoku({
      state: makeState(
        {
          history: {
            index: 1,
            stack: [initialState.board, initialState.board, initialState.board],
          },
          ...patch,
        },
        playingState,
      ),
    })
    render(<UndoRedo />)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it('keeps undo available once the puzzle is solved', () => {
    mockSudoku({
      state: makeState(
        {
          history: { index: 1, stack: [initialState.board, initialState.board] },
          solver: { isSolved: true },
        },
        playingState,
      ),
    })
    render(<UndoRedo />)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
  })

  it('calls undo on click', async () => {
    const user = userEvent.setup()
    mockSudoku({
      state: makeState(
        { history: { index: 1, stack: [initialState.board, initialState.board] } },
        playingState,
      ),
    })
    render(<UndoRedo />)

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(mockUndo).toHaveBeenCalled()
  })

  it('calls redo on click', async () => {
    const user = userEvent.setup()
    mockSudoku({
      state: makeState(
        { history: { index: 0, stack: [initialState.board, initialState.board] } },
        playingState,
      ),
    })
    render(<UndoRedo />)

    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(mockRedo).toHaveBeenCalled()
  })
})
