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

import { describe, expect, it } from 'vitest'

import type { SudokuAction } from '../sudoku.actions.types'
import { sudokuReducer } from '../sudoku.reducer'
import type { SudokuState, UiState } from '../sudoku.types'
import { createEmptyBoard, getDerivedBoardState, initialState } from './state'

// A valid solved grid, row r shifted by 3r plus one per band.
const solution = Array.from({ length: 81 }, (_, i) => {
  const r = Math.floor(i / 9)
  return ((r * 3 + Math.floor(r / 3) + (i % 9)) % 9) + 1
})
const cellsOf = (digit: number) => solution.flatMap((v, i) => (v === digit ? [i] : []))

const play = (givens: readonly number[] = [], ui: Partial<UiState> = {}): SudokuState => {
  const board = createEmptyBoard().map((cell, i) =>
    givens.includes(i) ? { ...cell, value: solution[i], isGiven: true } : cell,
  )
  return {
    ...initialState,
    board,
    initialBoard: board,
    history: { stack: [board], index: 0 },
    solver: { ...initialState.solver, gameMode: 'playing', solution },
    derived: getDerivedBoardState(board),
    ui: { ...initialState.ui, ...ui },
  }
}
const locked = (digit: number, givens: readonly number[] = [], ui: Partial<UiState> = {}) =>
  play(givens, { sticky: true, stickyValue: digit, highlightedValue: digit, ...ui })

const run = (state: SudokuState, ...actions: SudokuAction[]) => actions.reduce(sudokuReducer, state)
const tap = (index: number): SudokuAction => ({ type: 'TAP_CELL', index })
const lock = (value: number | null): SudokuAction => ({ type: 'SET_STICKY_VALUE', value })
const toggle: SudokuAction = { type: 'TOGGLE_STICKY' }

describe('sticky numbers', () => {
  describe('TOGGLE_STICKY', () => {
    it('turns the mode on without locking a digit', () => {
      const state = run(play(), toggle)
      expect(state.ui.sticky).toBe(true)
      expect(state.ui.stickyValue).toBeNull()
    })

    it('turns the mode off, releasing the lock and shading the selected cell again', () => {
      const state = run(locked(5, [0], { activeCellIndex: 0 }), toggle)
      expect(state.ui).toMatchObject({ sticky: false, stickyValue: null, highlightedValue: 1 })
    })

    it.each([
      ['paused', { ...play(), ui: { ...play().ui, isPaused: true } }],
      ['solving', { ...play(), solver: { ...play().solver, isSolving: true } }],
      ['in the walkthrough', { ...play(), solver: { ...play().solver, gameMode: 'visualizing' } }],
      ['on the selection screen', initialState],
    ] as [string, SudokuState][])('is refused while %s', (_, state) => {
      expect(run(state, toggle)).toBe(state)
    })

    it('stays out of the undo history', () => {
      const start = play()
      expect(run(start, toggle, lock(3)).history).toBe(start.history)
    })
  })

  describe('SET_STICKY_VALUE', () => {
    it('locks a digit and shades its cells', () => {
      const state = run(play([0], { sticky: true, activeCellIndex: 1 }), lock(1))
      expect(state.ui).toMatchObject({ stickyValue: 1, highlightedValue: 1 })
    })

    it('switches the lock to another digit', () => {
      expect(run(locked(1), lock(4)).ui.stickyValue).toBe(4)
    })

    it('releases the lock and keeps the mode on', () => {
      const state = run(locked(1, [1], { activeCellIndex: 1 }), lock(null))
      expect(state.ui).toMatchObject({ sticky: true, stickyValue: null, highlightedValue: 2 })
    })

    it('releases to no shading without a selected cell', () => {
      expect(run(locked(1), lock(null)).ui.highlightedValue).toBeNull()
    })

    it('is refused with the mode off', () => {
      const state = play()
      expect(run(state, lock(3))).toBe(state)
    })

    it('is refused for a digit already complete', () => {
      const state = play(cellsOf(7), { sticky: true })
      expect(run(state, lock(7))).toBe(state)
    })

    it('is refused while paused', () => {
      const state = play([], { sticky: true, isPaused: true })
      expect(run(state, lock(3))).toBe(state)
    })
  })

  describe('TAP_CELL', () => {
    it('changes nothing with no digit locked, since focus already selected the cell', () => {
      const state = play([], { sticky: true, activeCellIndex: 4 })
      expect(run(state, tap(4))).toBe(state)
    })

    it('changes nothing with the mode off', () => {
      const state = play()
      expect(run(state, tap(4))).toBe(state)
    })

    it('places the locked digit in Pen mode as one move', () => {
      const state = run(locked(1), tap(0))
      expect(state.board[0].value).toBe(1)
      expect(state.ui.activeCellIndex).toBe(0)
      expect(state.history.index).toBe(1)
      expect(state.game.mistakes).toBe(0)
    })

    it('keeps the lock and its shading across taps', () => {
      const state = run(locked(1), tap(0), tap(12))
      expect(state.board[12].value).toBe(1)
      expect(state.ui).toMatchObject({ stickyValue: 1, highlightedValue: 1, activeCellIndex: 12 })
    })

    it('counts a wrong digit as a mistake', () => {
      const state = run(locked(1), tap(1))
      expect(state.board[1].value).toBe(1)
      expect(state.game.mistakes).toBe(1)
    })

    it('removes the player copy of the locked digit', () => {
      const state = run(locked(1), tap(0), tap(0))
      expect(state.board[0].value).toBeNull()
      expect(state.history.index).toBe(2)
    })

    it('replaces another digit the player placed', () => {
      const state = run(locked(2), tap(0), lock(1), tap(0))
      expect(state.board[0].value).toBe(1)
    })

    it('only selects a given', () => {
      const start = locked(2, [0])
      const state = run(start, tap(0))
      expect(state.board).toBe(start.board)
      expect(state.ui).toMatchObject({ activeCellIndex: 0, stickyValue: 2, highlightedValue: 2 })
    })

    it('removes peer notes like ordinary input', () => {
      const withNote = run(locked(1, [], { inputMode: 'candidate' }), tap(1))
      expect(withNote.board[1].candidates).toEqual(new Set([1]))
      const placed = run({ ...withNote, ui: { ...withNote.ui, inputMode: 'normal' } }, tap(0))
      expect(placed.board[1].candidates.size).toBe(0)
    })

    it.each([
      ['candidate', 'candidates'],
      ['center', 'centers'],
    ] as const)('toggles a %s note on and off', (inputMode, key) => {
      const on = run(locked(3, [], { inputMode }), tap(40))
      expect(on.board[40][key]).toEqual(new Set([3]))
      const off = run(on, tap(40))
      expect(off.board[40][key].size).toBe(0)
      expect(off.history.index).toBe(2)
    })

    it('highlights the clash instead of adding a clashing note', () => {
      const start = locked(1, [0], { inputMode: 'candidate' })
      const state = run(start, tap(1))
      expect(state.board).toBe(start.board)
      expect(state.ui.transientConflicts).toEqual(new Set([0]))
    })

    it('undoes and redoes a tap like any move', () => {
      const placed = run(locked(1), tap(0))
      const undone = run(placed, { type: 'UNDO' })
      expect(undone.board[0].value).toBeNull()
      expect(undone.ui.stickyValue).toBe(1)
      expect(run(undone, { type: 'REDO' }).board[0].value).toBe(1)
    })

    it('is refused while paused', () => {
      const state = locked(1, [], { isPaused: true })
      expect(run(state, tap(0)).board).toBe(state.board)
    })
  })

  describe('lock release', () => {
    it('releases once the locked digit is complete and keeps the mode on', () => {
      const [last, ...rest] = cellsOf(9)
      const state = run(locked(9, rest), tap(last))
      expect(state.board[last].value).toBe(9)
      expect(state.ui).toMatchObject({ sticky: true, stickyValue: null, highlightedValue: 9 })
    })

    it('keeps the locked shading when the selection moves', () => {
      const state = run(locked(4, [0]), { type: 'SET_ACTIVE_CELL', index: 0 })
      expect(state.ui.highlightedValue).toBe(4)
    })

    it.each([
      ['pausing', { type: 'PAUSE_GAME' }],
      ['solving', { type: 'SOLVE_START' }],
      ['typing in a puzzle', { type: 'START_CUSTOM_PUZZLE' }],
    ] as [string, SudokuAction][])('releases on %s', (_, action) => {
      expect(run(locked(4), action).ui.stickyValue).toBeNull()
    })

    it('releases on a new puzzle while the mode stays on', () => {
      const puzzleString = '.'.repeat(81)
      const state = run(locked(4), {
        type: 'GENERATE_PUZZLE_SUCCESS',
        puzzleString,
        solutionString: solution.join(''),
      })
      expect(state.ui).toMatchObject({ sticky: true, stickyValue: null })
    })

    it('releases when the game mode changes while input stays open', () => {
      const typing = locked(4)
      const state = run(
        { ...typing, solver: { ...typing.solver, gameMode: 'customInput' } },
        { type: 'VALIDATE_PUZZLE_SUCCESS', solutionString: solution.join('') },
      )
      expect(state.solver.gameMode).toBe('playing')
      expect(state.ui.stickyValue).toBeNull()
    })
  })
})
