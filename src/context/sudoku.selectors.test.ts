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

import { createEmptyBoard, initialState } from './sudoku.reducer'
import {
  canAutoFill,
  canClearBoard,
  canRequestHint,
  canSolve,
  canUndoRedo,
  isBusy,
  isClockRunning,
  isEditable,
  isGridReadOnly,
  isWrongValue,
} from './sudoku.selectors'
import type { GameMode, SudokuState } from './sudoku.types'

const withSolver = (solver: Partial<SudokuState['solver']>, base = initialState): SudokuState => ({
  ...base,
  solver: { ...base.solver, ...solver },
})
const withUi = (ui: Partial<SudokuState['ui']>, base: SudokuState): SudokuState => ({
  ...base,
  ui: { ...base.ui, ...ui },
})
const withDerived = (derived: Partial<SudokuState['derived']>, base: SudokuState): SudokuState => ({
  ...base,
  derived: { ...base.derived, ...derived },
})

const playing = withSolver({ gameMode: 'playing' })
const playingWithDigits = withDerived({ isBoardEmpty: false, isBoardFull: false }, playing)
const custom = withSolver({ gameMode: 'customInput' })
const solving = withSolver({ isSolving: true }, playing)
const validating = withSolver({ isValidating: true }, custom)
const paused = withUi({ isPaused: true }, playing)
const solved = withSolver({ isSolved: true }, playing)

describe('sudoku selectors', () => {
  describe('isEditable', () => {
    it.each([
      [false, 'selecting'],
      [true, 'customInput'],
      [true, 'playing'],
      [false, 'visualizing'],
    ] as [boolean, GameMode][])('is %s in %s', (expected, gameMode) => {
      expect(isEditable(withSolver({ gameMode }))).toBe(expected)
    })
  })

  describe('isBusy', () => {
    it('is true while any board job runs', () => {
      expect(isBusy(initialState)).toBe(false)
      expect(isBusy(withSolver({ isGenerating: true }))).toBe(true)
      expect(isBusy(solving)).toBe(true)
      expect(isBusy(validating)).toBe(true)
    })

    it('ignores a hint in flight', () => {
      expect(isBusy(withSolver({ isHinting: true }, playing))).toBe(false)
    })
  })

  describe('isGridReadOnly', () => {
    it('is false while playing or typing a puzzle in', () => {
      expect(isGridReadOnly(playing)).toBe(false)
      expect(isGridReadOnly(custom)).toBe(false)
    })

    it.each([
      ['selecting', initialState],
      ['visualizing', withSolver({ gameMode: 'visualizing' })],
      ['solving', solving],
      ['validating', validating],
      ['paused', paused],
      ['solved', solved],
    ])('is true while %s', (_, state) => {
      expect(isGridReadOnly(state)).toBe(true)
    })
  })

  describe('canUndoRedo', () => {
    it('follows the grid, except that a solved board can still be stepped back', () => {
      expect(canUndoRedo(playing)).toBe(true)
      expect(canUndoRedo(custom)).toBe(true)
      expect(canUndoRedo(solved)).toBe(true)
      expect(canUndoRedo(paused)).toBe(false)
      expect(canUndoRedo(solving)).toBe(false)
      expect(canUndoRedo(validating)).toBe(false)
      expect(canUndoRedo(initialState)).toBe(false)
    })
  })

  describe('canClearBoard', () => {
    it('allows a reset after a win but not while paused or busy', () => {
      expect(canClearBoard(playing)).toBe(true)
      expect(canClearBoard(solved)).toBe(true)
      expect(canClearBoard(paused)).toBe(false)
      expect(canClearBoard(solving)).toBe(false)
      expect(canClearBoard(validating)).toBe(false)
      expect(canClearBoard(withSolver({ gameMode: 'visualizing' }))).toBe(false)
    })
  })

  describe('isClockRunning', () => {
    it('runs only during unsolved, unpaused play', () => {
      expect(isClockRunning(playing)).toBe(true)
      expect(isClockRunning(solved)).toBe(false)
      expect(isClockRunning(paused)).toBe(false)
      expect(isClockRunning(custom)).toBe(false)
    })
  })

  describe('isWrongValue', () => {
    const solution = Array.from({ length: 81 }, (_, i) => (i % 9) + 1)
    const board = createEmptyBoard().map((cell, i) => {
      if (i === 0) return { ...cell, value: 9, isGiven: true }
      if (i === 1) return { ...cell, value: 2 }
      if (i === 2) return { ...cell, value: 8 }
      return cell
    })
    const state: SudokuState = { ...withSolver({ solution }, playing), board }

    it('flags a placed digit that disagrees with the solution', () => {
      expect(isWrongValue(state, 2)).toBe(true)
    })

    it('ignores right digits, givens and empty cells', () => {
      expect(isWrongValue(state, 1)).toBe(false)
      expect(isWrongValue(state, 0)).toBe(false)
      expect(isWrongValue(state, 3)).toBe(false)
    })

    it('needs a known solution and a game in play', () => {
      expect(isWrongValue(withSolver({ solution: null }, state), 2)).toBe(false)
      expect(isWrongValue(withSolver({ gameMode: 'customInput' }, state), 2)).toBe(false)
    })
  })

  describe('canRequestHint', () => {
    it('is allowed during unsolved, unpaused play', () => {
      expect(canRequestHint(playing)).toBe(true)
    })

    it.each([
      ['outside play', custom],
      ['once solved', solved],
      ['while paused', paused],
      ['while solving', solving],
      ['while hinting', withSolver({ isHinting: true }, playing)],
    ])('is refused %s', (_, state) => {
      expect(canRequestHint(state)).toBe(false)
    })
  })

  describe('canAutoFill', () => {
    it('is allowed during play with some digits and some gaps', () => {
      expect(canAutoFill(playingWithDigits)).toBe(true)
    })

    it.each([
      ['outside play', withDerived({ isBoardEmpty: false }, custom)],
      ['while paused', withUi({ isPaused: true }, playingWithDigits)],
      ['while solving', withSolver({ isSolving: true }, playingWithDigits)],
      ['on an empty board', withDerived({ isBoardEmpty: true }, playingWithDigits)],
      ['on a full board', withDerived({ isBoardFull: true }, playingWithDigits)],
    ])('is refused %s', (_, state) => {
      expect(canAutoFill(state)).toBe(false)
    })
  })

  describe('canSolve', () => {
    it('is allowed on a partial board without conflicts', () => {
      expect(canSolve(playingWithDigits)).toBe(true)
    })

    it.each([
      ['while solving', withSolver({ isSolving: true }, playingWithDigits)],
      ['while validating', withSolver({ isValidating: true }, playingWithDigits)],
      ['while hinting', withSolver({ isHinting: true }, playingWithDigits)],
      ['while paused', withUi({ isPaused: true }, playingWithDigits)],
      ['once solved', withSolver({ isSolved: true }, playingWithDigits)],
      ['after a failed solve', withSolver({ solveFailed: true }, playingWithDigits)],
      ['on an empty board', withDerived({ isBoardEmpty: true }, playingWithDigits)],
      ['on a full board', withDerived({ isBoardFull: true }, playingWithDigits)],
      ['with conflicts', withDerived({ conflicts: new Set([0, 1]) }, playingWithDigits)],
    ])('is refused %s', (_, state) => {
      expect(canSolve(state)).toBe(false)
    })
  })
})
