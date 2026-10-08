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

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useSudokuDispatch, useSudokuState } from '@/context/sudoku.hooks'
import { initialState } from '@/context/sudoku.reducer'
import { useSudokuActions } from '@/hooks/useSudokuActions'

import { makeState, mockSudoku } from './sudoku-state'

vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

describe('makeState', () => {
  it('returns the initial state when given nothing', () => {
    expect(makeState()).toEqual(initialState)
  })

  it('merges each slice over the base without dropping its other fields', () => {
    const state = makeState({
      solver: { gameMode: 'playing' },
      ui: { isPaused: true },
      derived: { isBoardEmpty: false },
      game: { mistakes: 2 },
      history: { index: 1 },
    })
    expect(state.solver).toEqual({ ...initialState.solver, gameMode: 'playing' })
    expect(state.ui).toEqual({ ...initialState.ui, isPaused: true })
    expect(state.derived).toEqual({ ...initialState.derived, isBoardEmpty: false })
    expect(state.game).toEqual({ ...initialState.game, mistakes: 2 })
    expect(state.history).toEqual({ ...initialState.history, index: 1 })
  })

  it('keeps the reference of every slice it was not given', () => {
    const state = makeState({ solver: { isSolving: true } })
    expect(state.solver).not.toBe(initialState.solver)
    expect(state.ui).toBe(initialState.ui)
    expect(state.game).toBe(initialState.game)
    expect(state.history).toBe(initialState.history)
    expect(state.derived).toBe(initialState.derived)
  })

  it('replaces fields outside the slices whole', () => {
    const board = initialState.board.map((cell, i) => (i === 0 ? { ...cell, value: 5 } : cell))
    expect(makeState({ board }).board).toBe(board)
  })

  it('merges over a given base instead of the initial state', () => {
    const playing = makeState({ solver: { gameMode: 'playing' } })
    const solved = makeState({ solver: { isSolved: true } }, playing)
    expect(solved.solver).toEqual({ ...initialState.solver, gameMode: 'playing', isSolved: true })
  })

  it('leaves the base untouched', () => {
    const base = makeState()
    makeState({ solver: { isSolving: true } }, base)
    expect(base.solver.isSolving).toBe(false)
  })
})

describe('mockSudoku', () => {
  it('wires state, dispatch and actions into the mocked hooks', () => {
    const state = makeState({ ui: { inputMode: 'candidate' } })
    const dispatch = vi.fn()
    const undo = vi.fn()
    mockSudoku({ state, dispatch, actions: { undo } })

    const { result } = renderHook(() => ({
      state: useSudokuState(),
      dispatch: useSudokuDispatch(),
      actions: useSudokuActions(),
    }))
    expect(result.current.state).toBe(state)
    expect(result.current.dispatch).toBe(dispatch)
    expect(result.current.actions.undo).toBe(undo)
  })

  it('leaves a hook it was not given as it was', () => {
    const undo = vi.fn()
    mockSudoku({ state: initialState, actions: { undo } })
    const next = makeState({ solver: { gameMode: 'playing' } })
    mockSudoku({ state: next })

    expect(useSudokuState()).toBe(next)
    expect(useSudokuActions().undo).toBe(undo)
  })
})
