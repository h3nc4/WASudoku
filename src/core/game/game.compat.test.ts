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

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SudokuAction } from '@/context/sudoku.actions.types'
import { encodeBoard as oldEncode, loadPersistedState } from '@/context/sudoku.persistence'
import { initialState, loadInitialState, sudokuReducer } from '@/context/sudoku.reducer'
import {
  canAutoFill as oldCanAutoFill,
  canClearBoard,
  canSolve as oldCanSolve,
  canUndoRedo as oldCanUndo,
  isClockRunning as oldClockRunning,
  isGridReadOnly as oldReadOnly,
} from '@/context/sudoku.selectors'
import type { SolveResult as OldResult, SudokuState } from '@/context/sudoku.types'

import { type Board, parseBoard, valueAt } from '../board'
import { encodeBoard, readGame, readMetrics, readPool, STORAGE_KEYS } from '../codec/storage'
import type { CellIndex, Digit } from '../digits'
import { CELLS } from '../geometry'
import { toStack } from '../history'
import type { Difficulty } from '../pool'
import type { Event } from './events'
import { serialize } from './persist'
import { selectBoard, selectCells, selectControls, selectSeconds } from './selectors'
import { INITIAL_STATE, playOf, type State } from './state'
import type { SolveResult, Step } from './steps'
import { update } from './update'

const PUZZLE = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79'
const SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
const NEAR = `.${SOLUTION.slice(1)}`
const T0 = 1_000_000
const SECOND = 1_000

const at = (n: number) => n as CellIndex
const board = (text: string) => parseBoard(text) as Board

/** One scripted step, which each side turns into what its own UI would send. */
type Op =
  | { readonly op: 'select'; readonly index: number }
  | { readonly op: 'key'; readonly digit: number }
  | { readonly op: 'pad'; readonly digit: number }
  | { readonly op: 'erase'; readonly how: 'delete' | 'backspace' }
  | { readonly op: 'move'; readonly direction: 'up' | 'down' | 'left' | 'right' }
  | { readonly op: 'mode'; readonly mode: 'normal' | 'candidate' | 'center' }
  | { readonly op: 'undo' | 'redo' | 'clear' | 'autoFill' | 'pause' | 'resume' }
  | { readonly op: 'sticky' | 'release' | 'custom' | 'validate' | 'solve' | 'hint' | 'exit' }
  | { readonly op: 'tap'; readonly index: number }
  | { readonly op: 'newGame'; readonly difficulty: Difficulty }
  | { readonly op: 'generated'; readonly puzzle: string }
  | { readonly op: 'validated'; readonly solution: string | null }
  | { readonly op: 'solved'; readonly result: SolveResult }
  | { readonly op: 'step'; readonly delta: -1 | 1 }
  | { readonly op: 'view'; readonly cursor: number }
  | { readonly op: 'paste'; readonly text: string }
  | { readonly op: 'offer'; readonly puzzle: string }
  | { readonly op: 'accept' }
  | { readonly op: 'wait'; readonly seconds: number }

const toOldResult = ({ steps, solution }: SolveResult): OldResult => ({
  steps: steps.map((s) => ({
    technique: s.technique,
    placements: s.placements.map(({ index, digit }) => ({ index, value: digit })),
    eliminations: s.eliminations.map(({ index, digit }) => ({ index, value: digit })),
    cause: s.cause.map(({ index, candidates }) => ({
      index,
      candidates: [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => (candidates >> (d - 1)) & 1),
    })),
  })),
  solution: CELLS.map((i) => valueAt(solution, i) ?? '.').join(''),
})

/** The actions the old UI dispatches for a step, with the guards its components applied. */
function oldActions(state: SudokuState, op: Op): SudokuAction[] {
  const readOnly = oldReadOnly(state)
  switch (op.op) {
    case 'select':
      return readOnly ? [] : [{ type: 'SET_ACTIVE_CELL', index: op.index }]
    case 'key':
      return readOnly
        ? []
        : [
            { type: 'INPUT_VALUE', value: op.digit },
            { type: 'SET_HIGHLIGHTED_VALUE', value: op.digit },
          ]
    case 'pad': {
      const complete = state.board.filter((c) => c.value === op.digit).length >= 9
      if (readOnly || complete) return []
      if (state.ui.sticky) {
        return [
          { type: 'SET_STICKY_VALUE', value: op.digit === state.ui.stickyValue ? null : op.digit },
        ]
      }
      return [
        { type: 'SET_HIGHLIGHTED_VALUE', value: op.digit },
        { type: 'INPUT_VALUE', value: op.digit },
      ]
    }
    case 'erase':
      return readOnly ? [] : [{ type: 'ERASE_ACTIVE_CELL', mode: op.how }]
    case 'move':
      return readOnly ? [] : [{ type: 'NAVIGATE', direction: op.direction }]
    case 'mode':
      return [{ type: 'SET_INPUT_MODE', mode: op.mode }]
    case 'undo':
      return oldCanUndo(state) ? [{ type: 'UNDO' }] : []
    case 'redo':
      return oldCanUndo(state) ? [{ type: 'REDO' }] : []
    case 'clear':
      return canClearBoard(state) ? [{ type: 'CLEAR_BOARD' }] : []
    case 'autoFill':
      return oldCanAutoFill(state) ? [{ type: 'AUTO_FILL_CANDIDATES' }] : []
    case 'pause':
      return [{ type: 'PAUSE_GAME' }]
    case 'resume':
      return state.ui.isPaused ? [{ type: 'RESUME_GAME' }] : []
    case 'sticky':
      return [{ type: 'TOGGLE_STICKY' }]
    case 'release':
      return [{ type: 'SET_STICKY_VALUE', value: null }]
    case 'tap':
      return [{ type: 'TAP_CELL', index: op.index }]
    case 'custom':
      return [{ type: 'START_CUSTOM_PUZZLE' }]
    case 'validate':
      return state.derived.isBoardEmpty || state.solver.isValidating
        ? []
        : [{ type: 'VALIDATE_PUZZLE_START' }]
    case 'validated':
      return op.solution === null
        ? [{ type: 'VALIDATE_PUZZLE_FAILURE', error: 'invalid' }]
        : [{ type: 'VALIDATE_PUZZLE_SUCCESS', solutionString: op.solution }]
    case 'solve':
      return oldCanSolve(state) ? [{ type: 'SOLVE_START' }] : []
    case 'solved':
      return [
        {
          type: state.solver.isHinting ? 'HINT_SUCCESS' : 'SOLVE_SUCCESS',
          result: toOldResult(op.result),
        },
      ]
    case 'hint':
      return [{ type: 'REQUEST_HINT' }]
    case 'exit':
      return [{ type: 'EXIT_VISUALIZATION' }]
    case 'step':
      return [{ type: 'STEP_VISUALIZATION', delta: op.delta }]
    case 'view':
      return [{ type: 'VIEW_SOLVER_STEP', index: op.cursor }]
    case 'newGame':
      return [{ type: 'GENERATE_PUZZLE_START', difficulty: op.difficulty }]
    case 'generated':
      return [
        { type: 'GENERATE_PUZZLE_SUCCESS', puzzleString: op.puzzle, solutionString: SOLUTION },
      ]
    case 'paste': {
      const text = op.text.replaceAll(/\s/g, '')
      const editable =
        state.solver.gameMode === 'playing' || state.solver.gameMode === 'customInput'
      if (!editable || !/^[0-9.]{81}$/.test(text)) return []
      return state.solver.gameMode === 'playing'
        ? [{ type: 'OFFER_PUZZLE', boardString: text }]
        : [{ type: 'IMPORT_BOARD', boardString: text }]
    }
    case 'offer':
      return [{ type: 'OFFER_PUZZLE', boardString: op.puzzle }]
    case 'accept':
      return state.ui.pendingPuzzle === null
        ? []
        : [{ type: 'DISMISS_PUZZLE' }, { type: 'LOAD_PUZZLE', boardString: state.ui.pendingPuzzle }]
    case 'wait':
      return oldClockRunning(state)
        ? Array.from({ length: op.seconds }, () => ({ type: 'TICK_TIMER' as const }))
        : []
  }
}

/** The events the new UI and runtime send for a step. Each reply quotes the pending request id. */
function newEvents(state: State, op: Op): Event[] {
  const id = state.pending?.id ?? 0
  switch (op.op) {
    case 'select':
      return [{ type: 'select', index: at(op.index) }]
    case 'key':
      return [{ type: 'digit', digit: op.digit as Digit }]
    case 'pad':
      return [{ type: 'pad', digit: op.digit as Digit }]
    case 'erase':
      return [{ type: 'erase', how: op.how }]
    case 'move':
      return [{ type: 'move', direction: op.direction }]
    case 'mode':
      return [{ type: 'setMode', mode: op.mode }]
    case 'undo':
    case 'redo':
    case 'clear':
    case 'autoFill':
    case 'pause':
    case 'resume':
    case 'validate':
    case 'solve':
    case 'hint':
      return [{ type: op.op }]
    case 'sticky':
      return [{ type: 'toggleSticky' }]
    case 'release':
      return [{ type: 'releaseSticky' }]
    case 'tap':
      return [{ type: 'tap', index: at(op.index) }]
    case 'custom':
      return [{ type: 'enterCustom' }]
    case 'validated':
      return [{ type: 'validated', id, solution: op.solution === null ? null : board(op.solution) }]
    case 'solved':
      return [{ type: 'solved', id, result: op.result }]
    case 'exit':
      return [{ type: 'exitWalkthrough' }]
    case 'step':
      return [{ type: 'step', delta: op.delta }]
    case 'view':
      return [{ type: 'viewStep', cursor: op.cursor }]
    case 'newGame':
      return [{ type: 'newGame', difficulty: op.difficulty }]
    case 'generated':
      return [
        { type: 'generated', id, puzzle: { puzzleString: op.puzzle, solutionString: SOLUTION } },
      ]
    case 'paste':
      return [{ type: 'paste', text: op.text }]
    case 'offer':
      return [{ type: 'opened', search: `?p=${op.puzzle}`, href: 'https://a.test/' }]
    case 'accept':
      return [{ type: 'acceptOffer' }]
    case 'wait':
      return []
  }
}

interface Observed {
  readonly mode: string
  readonly paused: boolean
  readonly board: string
  readonly stack: readonly string[]
  readonly index: number
  readonly timer: number
  readonly mistakes: number
  readonly selected: number | null
  readonly sticky: readonly [boolean, number | null]
  readonly shown: string
  readonly controls: readonly boolean[]
}

function oldMode({ solver }: SudokuState): string {
  if (solver.gameMode === 'customInput') return 'entering'
  if (solver.gameMode === 'visualizing') return 'walkthrough'
  if (solver.gameMode === 'playing' && solver.isSolved) return 'won'
  return solver.gameMode
}

function observeOld(state: SudokuState): Observed {
  const mode = oldMode(state)
  const shown =
    mode === 'walkthrough' ? (state.solver.visualizationBoard ?? state.board) : state.board
  return {
    mode,
    paused: state.ui.isPaused,
    board: oldEncode(state.board),
    stack: mode === 'selecting' ? [] : state.history.stack.map(oldEncode),
    index: mode === 'selecting' ? 0 : state.history.index,
    timer: mode === 'selecting' ? 0 : state.game.timer,
    mistakes: mode === 'selecting' ? 0 : state.game.mistakes,
    selected: state.ui.activeCellIndex,
    sticky: [state.ui.sticky, state.ui.stickyValue],
    shown: shown.map((c) => c.value ?? '.').join(''),
    controls: [
      state.history.index > 0 && oldCanUndo(state),
      state.history.index < state.history.stack.length - 1 && oldCanUndo(state),
      oldCanSolve(state) && state.solver.gameMode === 'playing',
      oldReadOnly(state),
    ],
  }
}

function observeNew(state: State, now: number): Observed {
  const { game } = state
  const history = game.mode === 'entering' ? game.history : (playOf(game)?.history ?? null)
  const stack = history === null ? { stack: [], index: 0 } : toStack(history)
  const controls = selectControls(state)
  return {
    mode: game.mode,
    paused: game.mode === 'playing' && game.paused,
    board: encodeBoard(selectBoard(state)),
    stack: stack.stack.map(encodeBoard),
    index: stack.index,
    timer: selectSeconds(state, now),
    mistakes: playOf(game)?.mistakes ?? 0,
    selected: state.input.selected,
    sticky: [state.input.sticky, state.input.stickyDigit],
    shown: selectCells(state)
      .map((c) => c.digit ?? '.')
      .join(''),
    controls: [controls.undo, controls.redo, controls.solve, !controls.sticky],
  }
}

const POOL = (puzzles: readonly string[]) => ({
  easy: puzzles.map((puzzleString) => ({ puzzleString, solutionString: SOLUTION })),
  medium: [],
  hard: [],
  expert: [],
  extreme: [],
})

/** Runs a script on both sides, comparing what the player sees after every step. */
function compare(ops: readonly Op[], pooled: readonly string[] = [PUZZLE, NEAR]): State {
  let old: SudokuState = { ...initialState, puzzlePool: POOL(pooled) }
  let next: State = { ...INITIAL_STATE, pool: POOL(pooled) }
  let now = T0
  ops.forEach((op, i) => {
    for (const action of oldActions(old, op)) old = sudokuReducer(old, action)
    if (op.op === 'wait') now += op.seconds * SECOND
    for (const event of newEvents(next, op)) next = update(next, event, now).state
    expect({ step: i, op, ...observeNew(next, now) }).toEqual({ step: i, op, ...observeOld(old) })
  })
  return next
}

const single = (index: number, digit: number): Step => ({
  technique: 'NakedSingle',
  placements: [{ index: at(index), digit: digit as Digit }],
  eliminations: [],
  cause: [],
})

const openCells = Array.from(PUZZLE).flatMap((c, i) => (c === '.' ? [i] : []))
const fullSolve: SolveResult = {
  steps: openCells.map((i) => single(i, Number(SOLUTION[i]))),
  solution: board(SOLUTION),
}
const partialSolve: SolveResult = {
  steps: [single(2, 4), { ...single(3, 6), eliminations: [{ index: at(2), digit: 1 }] }],
  solution: board(SOLUTION),
}

describe('game update against the old reducer', () => {
  it('generates from the pool and plays digits, wrong ones counting as mistakes', () => {
    compare([
      { op: 'newGame', difficulty: 'easy' },
      { op: 'wait', seconds: 3 },
      { op: 'select', index: 2 },
      { op: 'key', digit: 4 },
      { op: 'select', index: 3 },
      { op: 'key', digit: 1 },
      { op: 'key', digit: 6 },
      { op: 'move', direction: 'right' },
      { op: 'move', direction: 'down' },
      { op: 'key', digit: 5 },
      { op: 'select', index: 0 },
      { op: 'key', digit: 9 },
      { op: 'erase', how: 'delete' },
      { op: 'select', index: 12 },
      { op: 'erase', how: 'backspace' },
      { op: 'wait', seconds: 10 },
    ])
  })

  it('generates on the worker when the pool is empty, from the selection screen', () => {
    compare(
      [
        { op: 'newGame', difficulty: 'hard' },
        { op: 'wait', seconds: 2 },
        { op: 'generated', puzzle: PUZZLE },
        { op: 'wait', seconds: 2 },
        { op: 'select', index: 2 },
        { op: 'key', digit: 4 },
      ],
      [],
    )
  })

  it('takes notes in both note modes, auto-fills, pulses a clash and erases notes', () => {
    compare([
      { op: 'newGame', difficulty: 'easy' },
      { op: 'mode', mode: 'candidate' },
      { op: 'select', index: 2 },
      { op: 'key', digit: 1 },
      { op: 'key', digit: 2 },
      { op: 'key', digit: 5 },
      { op: 'key', digit: 1 },
      { op: 'mode', mode: 'center' },
      { op: 'key', digit: 4 },
      { op: 'mode', mode: 'normal' },
      { op: 'select', index: 3 },
      { op: 'autoFill' },
      { op: 'autoFill' },
      { op: 'key', digit: 6 },
      { op: 'select', index: 2 },
      { op: 'erase', how: 'delete' },
      { op: 'erase', how: 'delete' },
    ])
  })

  it('undoes, redoes and clears, the clear itself undoable', () => {
    compare([
      { op: 'newGame', difficulty: 'easy' },
      { op: 'select', index: 2 },
      { op: 'key', digit: 4 },
      { op: 'select', index: 3 },
      { op: 'key', digit: 6 },
      { op: 'undo' },
      { op: 'undo' },
      { op: 'undo' },
      { op: 'redo' },
      { op: 'key', digit: 6 },
      { op: 'redo' },
      { op: 'clear' },
      { op: 'clear' },
      { op: 'undo' },
      { op: 'wait', seconds: 4 },
    ])
  })

  it('wins, stops the clock, steps back into play and wins again on redo', () => {
    compare([
      { op: 'newGame', difficulty: 'easy' },
      { op: 'newGame', difficulty: 'easy' },
      { op: 'wait', seconds: 5 },
      { op: 'select', index: 0 },
      { op: 'key', digit: 3 },
      { op: 'key', digit: 5 },
      { op: 'wait', seconds: 5 },
      { op: 'key', digit: 1 },
      { op: 'undo' },
      { op: 'wait', seconds: 2 },
      { op: 'redo' },
      { op: 'wait', seconds: 2 },
      { op: 'clear' },
      { op: 'wait', seconds: 1 },
    ])
  })

  it('pauses and resumes, the clock and the grid following', () => {
    compare([
      { op: 'newGame', difficulty: 'easy' },
      { op: 'wait', seconds: 2 },
      { op: 'select', index: 2 },
      { op: 'pause' },
      { op: 'wait', seconds: 30 },
      { op: 'key', digit: 4 },
      { op: 'select', index: 2 },
      { op: 'undo' },
      { op: 'pause' },
      { op: 'resume' },
      { op: 'wait', seconds: 3 },
      { op: 'resume' },
      { op: 'select', index: 2 },
      { op: 'key', digit: 4 },
    ])
  })

  it('points a hint at a mistake, then takes a solver step, and a reveal when logic is stuck', () => {
    compare([
      { op: 'newGame', difficulty: 'easy' },
      { op: 'select', index: 3 },
      { op: 'key', digit: 1 },
      { op: 'hint' },
      { op: 'erase', how: 'delete' },
      { op: 'hint' },
      { op: 'solved', result: partialSolve },
      { op: 'select', index: 2 },
      { op: 'key', digit: 4 },
      { op: 'hint' },
      { op: 'solved', result: { steps: [], solution: board(SOLUTION) } },
      { op: 'wait', seconds: 1 },
    ])
  })

  it('walks through a full solve and back into play', () => {
    compare([
      { op: 'newGame', difficulty: 'easy' },
      { op: 'wait', seconds: 7 },
      { op: 'select', index: 2 },
      { op: 'key', digit: 4 },
      { op: 'solve' },
      { op: 'wait', seconds: 1 },
      { op: 'solved', result: fullSolve },
      { op: 'wait', seconds: 9 },
      { op: 'step', delta: 1 },
      { op: 'step', delta: -1 },
      { op: 'view', cursor: 0 },
      { op: 'step', delta: -1 },
      { op: 'step', delta: 1 },
      { op: 'view', cursor: 20 },
      { op: 'view', cursor: fullSolve.steps.length },
      { op: 'select', index: 3 },
      { op: 'undo' },
      { op: 'exit' },
      { op: 'wait', seconds: 2 },
      { op: 'select', index: 3 },
      { op: 'key', digit: 6 },
    ])
  })

  it('walks through a solve that needed backtracking', () => {
    compare([
      { op: 'newGame', difficulty: 'easy' },
      { op: 'solve' },
      { op: 'solved', result: partialSolve },
      { op: 'step', delta: -1 },
      { op: 'step', delta: -1 },
      { op: 'step', delta: -1 },
      { op: 'step', delta: 1 },
      { op: 'step', delta: 1 },
      { op: 'step', delta: 1 },
      { op: 'exit' },
    ])
  })

  it('types a puzzle in, validates it and plays it as a custom game', () => {
    compare([
      { op: 'custom' },
      { op: 'validate' },
      { op: 'select', index: 0 },
      { op: 'key', digit: 5 },
      { op: 'key', digit: 3 },
      { op: 'key', digit: 3 },
      { op: 'pad', digit: 7 },
      { op: 'move', direction: 'left' },
      { op: 'erase', how: 'backspace' },
      { op: 'undo' },
      { op: 'redo' },
      { op: 'mode', mode: 'candidate' },
      { op: 'select', index: 40 },
      { op: 'key', digit: 9 },
      { op: 'mode', mode: 'normal' },
      { op: 'wait', seconds: 3 },
      { op: 'validate' },
      { op: 'key', digit: 1 },
      { op: 'validated', solution: SOLUTION },
      { op: 'wait', seconds: 3 },
      { op: 'select', index: 2 },
      { op: 'key', digit: 9 },
    ])
  })

  it('keeps typing after an invalid puzzle, clears it and imports a paste', () => {
    compare([
      { op: 'custom' },
      { op: 'select', index: 0 },
      { op: 'key', digit: 5 },
      { op: 'validate' },
      { op: 'validated', solution: null },
      { op: 'key', digit: 2 },
      { op: 'clear' },
      { op: 'clear' },
      { op: 'paste', text: 'junk' },
      { op: 'paste', text: `${PUZZLE.slice(0, 9)}\n${PUZZLE.slice(9)}` },
      { op: 'select', index: 2 },
      { op: 'key', digit: 4 },
    ])
  })

  it('offers a shared or pasted puzzle and validates it on accept', () => {
    compare([
      { op: 'offer', puzzle: PUZZLE },
      { op: 'accept' },
      { op: 'validated', solution: SOLUTION },
      { op: 'wait', seconds: 2 },
      { op: 'select', index: 2 },
      { op: 'key', digit: 4 },
      { op: 'paste', text: NEAR },
      { op: 'accept' },
      { op: 'validated', solution: SOLUTION },
      { op: 'select', index: 0 },
      { op: 'key', digit: 5 },
    ])
  })

  it('locks a sticky digit, taps it in and out, and releases it as the old app did', () => {
    compare([
      { op: 'newGame', difficulty: 'easy' },
      { op: 'sticky' },
      { op: 'pad', digit: 4 },
      { op: 'tap', index: 2 },
      { op: 'tap', index: 2 },
      { op: 'tap', index: 0 },
      { op: 'pad', digit: 6 },
      { op: 'tap', index: 3 },
      { op: 'tap', index: 11 },
      { op: 'mode', mode: 'candidate' },
      { op: 'tap', index: 4 },
      { op: 'tap', index: 20 },
      { op: 'mode', mode: 'normal' },
      { op: 'release' },
      { op: 'pad', digit: 1 },
      { op: 'pad', digit: 1 },
      { op: 'pad', digit: 8 },
      { op: 'pause' },
      { op: 'resume' },
      { op: 'pad', digit: 2 },
      { op: 'newGame', difficulty: 'easy' },
      { op: 'pad', digit: 5 },
      { op: 'tap', index: 0 },
      { op: 'sticky' },
      { op: 'pad', digit: 3 },
    ])
  })

  it('releases a sticky lock on a win', () => {
    compare([
      { op: 'newGame', difficulty: 'easy' },
      { op: 'newGame', difficulty: 'easy' },
      { op: 'sticky' },
      { op: 'pad', digit: 5 },
      { op: 'tap', index: 0 },
      { op: 'undo' },
      { op: 'pad', digit: 5 },
    ])
  })
})

describe('loading against the old loader', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const loadBoth = (now = T0) => {
    const old = loadInitialState()
    const slices = {
      game: readGame(localStorage.getItem(STORAGE_KEYS.GAME)),
      metrics: readMetrics(localStorage.getItem(STORAGE_KEYS.METRICS)),
      pool: readPool(localStorage.getItem(STORAGE_KEYS.POOL)),
    }
    const next = update(INITIAL_STATE, { type: 'loaded', slices }, now).state
    return { old, next }
  }

  const write = (state: State, now = T0) => {
    for (const key of Object.values(STORAGE_KEYS)) {
      const text = serialize(state, key, now)
      if (text !== null) localStorage.setItem(key, text)
    }
  }

  const scripted = (ops: readonly Op[]) => compare(ops)

  it('resumes a game in play with its history, timer and mistakes', () => {
    write(
      scripted([
        { op: 'newGame', difficulty: 'easy' },
        { op: 'select', index: 2 },
        { op: 'key', digit: 1 },
        { op: 'key', digit: 4 },
        { op: 'wait', seconds: 12 },
      ]),
      T0 + 12 * SECOND,
    )
    const { old, next } = loadBoth()
    expect(observeNew(next, T0)).toEqual({
      ...observeOld(old),
      controls: observeNew(next, T0).controls,
    })
    expect(next.pool).toEqual(old.puzzlePool)
  })

  it('resumes a won game as won', () => {
    write(
      scripted([
        { op: 'newGame', difficulty: 'easy' },
        { op: 'newGame', difficulty: 'easy' },
        { op: 'select', index: 0 },
        { op: 'key', digit: 5 },
      ]),
    )
    const { old, next } = loadBoth()
    expect(observeNew(next, T0).mode).toBe('won')
    expect(observeOld(old).mode).toBe('won')
  })

  it('resumes a typed-in puzzle as play, the flagged behaviour kept', () => {
    write(scripted([{ op: 'custom' }, { op: 'select', index: 0 }, { op: 'key', digit: 5 }]))
    const { old, next } = loadBoth()
    expect(observeOld(old)).toMatchObject({ mode: 'playing' })
    expect(observeNew(next, T0)).toEqual({
      ...observeOld(old),
      controls: observeNew(next, T0).controls,
    })
  })

  it('starts on the selection screen from nothing, or from a corrupt game, keeping the pool', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(loadBoth().next.game.mode).toBe(oldMode(loadBoth().old))
    localStorage.setItem(STORAGE_KEYS.GAME, '{')
    localStorage.setItem(STORAGE_KEYS.POOL, JSON.stringify({ puzzlePool: POOL([PUZZLE]) }))
    const { old, next } = loadBoth()
    expect(next.game.mode).toBe('selecting')
    expect(oldMode(old)).toBe('selecting')
    expect(next.pool).toEqual(old.puzzlePool)
  })

  it('reads a legacy save as the old loader did', () => {
    const legacyCell = (char: string) => ({
      value: char === '.' ? null : Number(char),
      isGiven: char !== '.',
      candidates: { __dataType: 'Set', value: [] },
      centers: { __dataType: 'Set', value: [] },
    })
    const cells = Array.from(PUZZLE, legacyCell)
    localStorage.setItem(
      STORAGE_KEYS.GAME,
      JSON.stringify({
        history: { stack: [cells], index: 0 },
        initialBoard: cells,
        solution: Array.from(SOLUTION, Number),
        difficulty: 'easy',
      }),
    )
    const { old, next } = loadBoth()
    expect(observeNew(next, T0)).toEqual({
      ...observeOld(old),
      controls: observeNew(next, T0).controls,
    })
    expect(loadPersistedState().game).not.toBeNull()
  })
})

/** Runs both sides without comparing, for the paths where the rewrite departs on purpose. */
function both(ops: readonly Op[], pooled: readonly string[] = [PUZZLE, NEAR]) {
  let old: SudokuState = { ...initialState, puzzlePool: POOL(pooled) }
  let next: State = { ...INITIAL_STATE, pool: POOL(pooled) }
  for (const op of ops) {
    for (const action of oldActions(old, op)) old = sudokuReducer(old, action)
    for (const event of newEvents(next, op)) next = update(next, event, T0).state
  }
  return { old: observeOld(old), next: observeNew(next, T0), oldState: old, nextState: next }
}

describe('departures from the old reducer', () => {
  it('keeps the game in play while the generator works, where the old one emptied the board', () => {
    const { old, next } = both(
      [
        { op: 'newGame', difficulty: 'easy' },
        { op: 'select', index: 2 },
        { op: 'key', digit: 4 },
        { op: 'newGame', difficulty: 'hard' },
      ],
      [PUZZLE],
    )
    expect(old.board).toBe(oldEncode(initialState.board))
    expect(next.board).not.toBe(old.board)
    expect(next.mode).toBe('playing')
  })

  it('ignores a generated puzzle once custom entry replaced the request, where the old one started it', () => {
    const { old, next } = both(
      [
        { op: 'newGame', difficulty: 'hard' },
        { op: 'custom' },
        { op: 'generated', puzzle: PUZZLE },
      ],
      [],
    )
    expect(old.mode).toBe('playing')
    expect(next.mode).toBe('entering')
  })

  it('shows a won board as won after clear and undo, where the old one played on a full board', () => {
    const { old, next } = both([
      { op: 'newGame', difficulty: 'easy' },
      { op: 'newGame', difficulty: 'easy' },
      { op: 'select', index: 0 },
      { op: 'key', digit: 5 },
      { op: 'clear' },
      { op: 'undo' },
    ])
    expect(old.mode).toBe('playing')
    expect(next.mode).toBe('won')
  })

  it('wins a validated board that is already full, where the old one played it', () => {
    const { old, next } = both([
      { op: 'custom' },
      { op: 'paste', text: SOLUTION },
      { op: 'validate' },
      { op: 'validated', solution: SOLUTION },
    ])
    expect(old.mode).toBe('playing')
    expect(next.mode).toBe('won')
  })

  it('lets solving run again after any board change, where the old one kept it off after a redo', () => {
    const { oldState, nextState } = both([
      { op: 'newGame', difficulty: 'easy' },
      { op: 'select', index: 2 },
      { op: 'key', digit: 4 },
      { op: 'undo' },
      { op: 'solve' },
    ])
    const old = sudokuReducer(sudokuReducer(oldState, { type: 'SOLVE_FAILURE' }), { type: 'REDO' })
    const failed = update(
      nextState,
      { type: 'failed', id: nextState.pending?.id ?? 0, reason: 'x' },
      T0,
    ).state
    const next = update(failed, { type: 'redo' }, T0).state
    expect(oldCanSolve(old)).toBe(false)
    expect(selectControls(next).solve).toBe(true)
  })

  it('opens the walkthrough unpaused when the game was paused during the solve', () => {
    const { old, next } = both([
      { op: 'newGame', difficulty: 'easy' },
      { op: 'solve' },
      { op: 'pause' },
      { op: 'solved', result: fullSolve },
    ])
    expect(old).toMatchObject({ mode: 'walkthrough', paused: true })
    expect(next).toMatchObject({ mode: 'walkthrough', paused: false })
  })
})
