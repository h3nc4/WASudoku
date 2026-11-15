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

import { type Board, parseBoard } from '../board'
import type { CellIndex, Digit } from '../digits'
import { maskOf } from '../digits'
import { EMPTY_POOL } from '../pool'
import type { Event } from './events'
import { fromKey } from './events'
import {
  type CellView,
  MISTAKE_LIMIT,
  RIPPLE_STAGGER_MS,
  sameCellView,
  selectBoard,
  selectBoardChange,
  selectCell,
  selectCells,
  selectControls,
  selectGenerating,
  selectGrid,
  selectHint,
  selectInputMode,
  selectKeyContext,
  selectMode,
  selectOffer,
  selectPad,
  selectSeconds,
  selectSelection,
  selectStatus,
  selectWalkthrough,
  selectWin,
} from './selectors'
import { INITIAL_STATE, type State } from './state'
import { isTechnique, type SolveResult, type Step } from './steps'
import { update } from './update'

const PUZZLE = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79'
const SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
const T0 = 50_000

const at = (n: number) => n as CellIndex
const board = (text: string) => parseBoard(text) as Board
const solvedExcept = (...open: number[]) =>
  Array.from(SOLUTION, (char, i) => (open.includes(i) ? '.' : char)).join('')

function run(state: State, events: readonly Event[], now = T0): State {
  return events.reduce((current, event) => update(current, event, now).state, state)
}

const start = (puzzle = PUZZLE): State =>
  run(
    {
      ...INITIAL_STATE,
      pool: { ...EMPTY_POOL, easy: [{ puzzleString: puzzle, solutionString: SOLUTION }] },
    },
    [{ type: 'newGame', difficulty: 'easy' }],
  )

const select = (index: number): Event => ({ type: 'select', index: at(index) })
const digit = (d: number): Event => ({ type: 'digit', digit: d as Digit })
const cell = (state: State, index: number) => selectCell(state, at(index)) as CellView

const step = (index: number, d: number, extra: Partial<Step> = {}): Step => ({
  technique: 'NakedSingle',
  placements: [{ index: at(index), digit: d as Digit }],
  eliminations: [],
  cause: [],
  ...extra,
})

const walkthrough = (steps: readonly Step[]): State => {
  const asked = run(start(), [{ type: 'solve' }])
  const result: SolveResult = { steps, solution: board(SOLUTION) }
  return run(asked, [{ type: 'solved', id: 1, result }])
}

describe('selectors', () => {
  describe('modes and grid', () => {
    it('reads the mode, the input mode and the board, empty on the selection screen', () => {
      expect(selectMode(INITIAL_STATE)).toBe('selecting')
      expect(selectInputMode(INITIAL_STATE)).toBe('normal')
      expect(selectBoard(INITIAL_STATE).cells.every((code) => code === 0)).toBe(true)
      expect(selectMode(start())).toBe('playing')
      expect(selectSelection(INITIAL_STATE)).toBeNull()
      expect(selectSelection(run(start(), [{ type: 'select', index: at(4) }]))).toBe(4)
    })

    it('makes the grid read-only outside play and entry, while paused and while solving', () => {
      expect(selectGrid(start())).toEqual({
        readOnly: false,
        paused: false,
        solving: false,
        walkthrough: false,
        pasteAllowed: true,
        pulse: null,
      })
      expect(selectGrid(INITIAL_STATE)).toMatchObject({ readOnly: true, pasteAllowed: false })
      expect(selectGrid(run(start(), [{ type: 'pause' }]))).toMatchObject({
        readOnly: true,
        paused: true,
      })
      expect(selectGrid(run(start(), [{ type: 'solve' }]))).toMatchObject({
        readOnly: true,
        solving: true,
      })
      expect(selectGrid(walkthrough([]))).toMatchObject({ readOnly: true, walkthrough: true })
      const typed = run(INITIAL_STATE, [
        { type: 'enterCustom' },
        select(0),
        digit(5),
        { type: 'validate' },
      ])
      expect(selectGrid(typed)).toMatchObject({ readOnly: true, pasteAllowed: true })
      const won = run(start(solvedExcept(0)), [select(0), digit(5)])
      expect(selectGrid(won)).toMatchObject({ readOnly: true, pasteAllowed: true })
    })

    it('carries the conflict pulse for the cells that refused a note', () => {
      const state = run(start(), [{ type: 'setMode', mode: 'candidate' }, select(2), digit(5)])
      expect(selectGrid(state).pulse).toBe(1)
      expect(cell(state, 0).flashing).toBe(true)
      expect(cell(state, 1).flashing).toBe(false)
    })
  })

  describe('cells', () => {
    it('draws digits, givens, notes, conflicts and wrong digits', () => {
      const state = run(start(), [
        { type: 'setMode', mode: 'candidate' },
        select(3),
        digit(6),
        { type: 'setMode', mode: 'normal' },
        select(2),
        digit(5),
      ])
      expect(cell(state, 0)).toMatchObject({ digit: 5, given: true, conflict: true, wrong: false })
      expect(cell(state, 2)).toMatchObject({ digit: 5, given: false, conflict: true, wrong: true })
      expect(cell(state, 3)).toMatchObject({ digit: null, candidates: maskOf([6]), centers: 0 })
    })

    it('shades the selection, its units and its digit', () => {
      const state = run(start(), [select(0)])
      expect(cell(state, 0)).toMatchObject({ selected: true, peer: true, sameDigit: true })
      expect(cell(state, 8)).toMatchObject({ selected: false, peer: true })
      expect(cell(state, 80)).toMatchObject({ peer: false, sameDigit: false })
      const five = selectCells(state).filter((view) => view.sameDigit)
      expect(five.length).toBeGreaterThan(1)
    })

    it('shows no selection after a win', () => {
      const won = run(start(solvedExcept(0)), [select(0), digit(5)])
      expect(cell(won, 0)).toMatchObject({ selected: false, peer: false, sameDigit: false })
    })

    it('builds the views once per state, blank on the selection screen', () => {
      expect(
        selectCells(INITIAL_STATE).every((view) => view.digit === null && !view.conflict),
      ).toBe(true)
      const state = start()
      expect(selectCells(state)).toBe(selectCells(state))
      expect(selectCell(state, at(81))).toBeUndefined()
    })

    it('marks a step hint: its pattern, its placement, and its eliminations otherwise', () => {
      const asked = run(start(), [{ type: 'hint' }])
      const placing = step(2, 4, { cause: [{ index: at(0), candidates: maskOf([5]) }] })
      const shown = run(asked, [
        { type: 'solved', id: 1, result: { steps: [placing], solution: board(SOLUTION) } },
      ])
      expect(cell(shown, 0).cause).toBe(true)
      expect(cell(shown, 2).hintTarget).toBe(true)
      expect(selectHint(shown)).toEqual({ kind: 'step', step: placing })
      const striking: Step = {
        technique: 'PointingPair',
        placements: [],
        eliminations: [{ index: at(3), digit: 2 }],
        cause: [],
      }
      const struck = run(run(start(), [{ type: 'hint' }]), [
        { type: 'solved', id: 1, result: { steps: [striking], solution: board(SOLUTION) } },
      ])
      expect(cell(struck, 3)).toMatchObject({ hintTarget: true, eliminated: maskOf([2]) })
    })

    it('marks a mistake hint on its cell', () => {
      const state = run(start(), [select(2), digit(9), { type: 'hint' }])
      expect(cell(state, 2).hintTarget).toBe(true)
      expect(selectHint(INITIAL_STATE)).toBeNull()
    })

    it('compares two views field by field', () => {
      const state = start()
      expect(sameCellView(cell(state, 0), { ...cell(state, 0) })).toBe(true)
      expect(sameCellView(cell(state, 0), cell(state, 1))).toBe(false)
    })
  })

  describe('walkthrough', () => {
    const steps = [
      step(3, 6, {
        eliminations: [{ index: at(2), digit: 1 }],
        cause: [{ index: at(1), candidates: maskOf([3]) }],
      }),
      step(2, 4),
    ]

    it('opens on the solution, and reads each position', () => {
      const state = walkthrough(steps)
      expect(selectWalkthrough(state)).toMatchObject({
        cursor: 3,
        atEnd: true,
        atStart: false,
        step: { technique: 'Backtracking' },
      })
      const startView = selectWalkthrough(run(state, [{ type: 'viewStep', cursor: 0 }]))
      expect(startView).toMatchObject({ cursor: 0, step: null, atStart: true, atEnd: false })
      expect(selectWalkthrough(start())).toBeNull()
    })

    it('draws the board as given, with candidates and nothing marked, at the start', () => {
      const state = run(walkthrough(steps), [{ type: 'viewStep', cursor: 0 }])
      expect(cell(state, 2)).toMatchObject({
        digit: null,
        candidates: maskOf([1, 2, 4]),
        placed: false,
        cause: false,
      })
      expect(cell(state, 0)).toMatchObject({ digit: 5, given: true, selected: false })
    })

    it('draws a step with its placement, its pattern and its eliminations', () => {
      const state = run(walkthrough(steps), [{ type: 'viewStep', cursor: 1 }])
      expect(cell(state, 3)).toMatchObject({ digit: 6, placed: true })
      expect(cell(state, 1).cause).toBe(true)
      expect(cell(state, 2)).toMatchObject({
        digit: null,
        eliminated: maskOf([1]),
        candidates: maskOf([1, 2, 4]),
      })
    })

    it('applies earlier eliminations to the candidates of a later step', () => {
      const state = run(walkthrough(steps), [{ type: 'viewStep', cursor: 2 }])
      expect(cell(state, 2)).toMatchObject({ digit: 4, placed: true, candidates: maskOf([2, 4]) })
      expect(cell(state, 3).placed).toBe(false)
    })

    it('draws the full solution at the end', () => {
      const state = walkthrough(steps)
      expect(selectCells(state).every((view) => view.digit !== null)).toBe(true)
      expect(cell(state, 80).digit).toBe(9)
    })
  })

  describe('pad', () => {
    it('counts the digits left and disables a complete one', () => {
      const keys = selectPad(start(solvedExcept(0)))
      expect(keys[4]).toEqual({
        digit: 5,
        remaining: 1,
        disabled: false,
        locked: false,
        pressed: null,
      })
      expect(keys[8]).toMatchObject({ digit: 9, remaining: 0, disabled: true })
    })

    it('disables every key on a read-only grid, and presses the locked one under sticky numbers', () => {
      expect(selectPad(INITIAL_STATE).every((key) => key.disabled && key.remaining === 9)).toBe(
        true,
      )
      const sticky = run(start(), [{ type: 'toggleSticky' }, { type: 'pad', digit: 4 }])
      const keys = selectPad(sticky)
      expect(keys[3]).toMatchObject({ locked: true, pressed: true })
      expect(keys[0]).toMatchObject({ locked: false, pressed: false })
    })

    it('never counts below zero', () => {
      const extra = run(start(solvedExcept(0)), [select(0), digit(9)])
      expect(selectPad(extra)[8]?.remaining).toBe(0)
    })
  })

  describe('controls', () => {
    it('allows input, notes, hints and solving in fresh play, but no undo or clear', () => {
      expect(selectControls(start())).toEqual({
        undo: false,
        redo: false,
        clear: false,
        autoFill: true,
        erase: false,
        sticky: true,
        stickyOn: false,
        hint: true,
        solve: true,
        solveBlock: null,
        validate: false,
        newPuzzle: true,
        confirmNewPuzzle: false,
        inputMode: true,
        busy: null,
      })
    })

    it('follows the history, and asks before a new puzzle once there is progress', () => {
      const moved = run(start(), [select(2), digit(4), select(3), digit(6), { type: 'undo' }])
      expect(selectControls(moved)).toMatchObject({
        undo: true,
        redo: true,
        clear: true,
        erase: true,
        confirmNewPuzzle: true,
      })
    })

    it('allows undo and clear after a win, but no input, hint or new-puzzle confirmation', () => {
      const won = run(start(solvedExcept(0)), [select(0), digit(5)])
      expect(selectControls(won)).toMatchObject({
        undo: true,
        clear: true,
        autoFill: false,
        erase: false,
        sticky: false,
        hint: false,
        solve: false,
        confirmNewPuzzle: false,
      })
    })

    it('locks everything but new puzzles while paused, and new puzzles while busy', () => {
      const paused = run(start(), [select(2), digit(4), { type: 'pause' }])
      expect(selectControls(paused)).toMatchObject({
        undo: false,
        clear: false,
        hint: false,
        solve: false,
        newPuzzle: true,
      })
      const solving = run(start(), [{ type: 'solve' }])
      expect(selectControls(solving)).toMatchObject({
        newPuzzle: false,
        busy: 'solve',
        hint: false,
      })
      const hinting = run(start(), [{ type: 'hint' }])
      expect(selectControls(hinting)).toMatchObject({ newPuzzle: true, busy: 'hint', solve: false })
    })

    it('names why solving is refused', () => {
      const clash = run(start(), [select(2), digit(5)])
      expect(selectControls(clash)).toMatchObject({ solve: false, solveBlock: 'conflicts' })
      const full = run(INITIAL_STATE, [
        {
          type: 'loaded',
          slices: {
            game: {
              status: 'ok',
              value: {
                history: { past: [], present: board(SOLUTION), future: [] },
                puzzle: board(PUZZLE),
                solution: null,
                difficulty: null,
              },
            },
            metrics: { status: 'absent' },
            pool: { status: 'absent' },
          },
        },
      ])
      expect(selectControls(full)).toMatchObject({ solve: false, solveBlock: 'full' })
      const failed = run(start(), [{ type: 'solve' }, { type: 'failed', id: 1, reason: 'x' }])
      expect(selectControls(failed).solveBlock).toBe('failed')
      expect(selectControls(INITIAL_STATE).solveBlock).toBeNull()
    })

    it('refuses solving and auto-fill on an empty board in play', () => {
      const empty = run(start(), [{ type: 'paste', text: '.'.repeat(81) }])
      expect(empty.offer).toBe('.'.repeat(81))
      const custom = run(INITIAL_STATE, [
        { type: 'enterCustom' },
        select(0),
        digit(5),
        { type: 'validate' },
      ])
      const played = run(custom, [
        { type: 'validated', id: 1, solution: board(SOLUTION) },
        select(0),
        { type: 'erase', how: 'delete' },
      ])
      expect(selectControls(played)).toMatchObject({ solve: true, autoFill: true })
      const blankBoard = board('.'.repeat(81))
      const blank = run(INITIAL_STATE, [
        {
          type: 'loaded',
          slices: {
            game: {
              status: 'ok',
              value: {
                history: { past: [], present: blankBoard, future: [] },
                puzzle: blankBoard,
                solution: null,
                difficulty: null,
              },
            },
            metrics: { status: 'absent' },
            pool: { status: 'absent' },
          },
        },
      ])
      expect(selectControls(blank)).toMatchObject({
        solve: false,
        solveBlock: 'empty',
        autoFill: false,
      })
    })

    it('validates a typed-in board, and confirms leaving it once anything is typed', () => {
      const empty = run(INITIAL_STATE, [{ type: 'enterCustom' }])
      expect(selectControls(empty)).toMatchObject({
        validate: false,
        clear: false,
        confirmNewPuzzle: false,
        autoFill: false,
      })
      const typed = run(empty, [select(0), digit(5)])
      expect(selectControls(typed)).toMatchObject({
        validate: true,
        clear: true,
        confirmNewPuzzle: true,
      })
      expect(selectControls(run(typed, [{ type: 'validate' }]))).toMatchObject({
        validate: false,
        busy: 'validate',
        newPuzzle: false,
      })
    })

    it('turns the input mode off in the walkthrough and asks before leaving its progress', () => {
      const walk = walkthrough([])
      expect(selectControls(walk)).toMatchObject({
        inputMode: false,
        undo: false,
        confirmNewPuzzle: false,
      })
      const progressed = run(start(), [
        select(2),
        digit(4),
        { type: 'solve' },
        { type: 'solved', id: 1, result: { steps: [], solution: board(SOLUTION) } },
      ])
      expect(selectControls(progressed).confirmNewPuzzle).toBe(true)
      expect(selectControls(INITIAL_STATE)).toMatchObject({ undo: false, confirmNewPuzzle: false })
    })
  })

  describe('status and dialogs', () => {
    it('shows difficulty and mistakes in play and after a win, and nothing elsewhere', () => {
      const mistakes = run(start(), [select(2), digit(1), digit(2), digit(3)])
      expect(selectStatus(mistakes)).toEqual({
        difficulty: 'easy',
        mistakes: MISTAKE_LIMIT,
        overLimit: true,
        solved: false,
        paused: false,
      })
      expect(selectStatus(run(start(), [{ type: 'pause' }]))).toMatchObject({
        paused: true,
        overLimit: false,
      })
      const won = run(start(solvedExcept(0)), [select(0), digit(5)])
      expect(selectStatus(won)).toMatchObject({ solved: true, paused: false })
      expect(selectStatus(INITIAL_STATE)).toBeNull()
      expect(selectStatus(walkthrough([]))).toBeNull()
    })

    it('reads the clock in whole seconds at any moment', () => {
      const state = start()
      expect(selectSeconds(state, T0 + 61_999)).toBe(61)
      expect(selectSeconds(INITIAL_STATE, T0)).toBe(0)
    })

    it('opens the win dialog after a win, held back while a puzzle is offered', () => {
      const won = run(start(solvedExcept(0)), [select(0), digit(5)])
      expect(selectWin(won)).toEqual({ difficulty: 'easy', mistakes: 0 })
      expect(selectWin({ ...won, offer: PUZZLE })).toBeNull()
      expect(selectWin(start())).toBeNull()
    })

    it('offers a puzzle, saying whether it replaces a game', () => {
      expect(selectOffer(INITIAL_STATE)).toBeNull()
      expect(selectOffer({ ...INITIAL_STATE, offer: PUZZLE })).toEqual({
        puzzle: PUZZLE,
        replacesGame: false,
      })
      expect(selectOffer({ ...start(), offer: PUZZLE })?.replacesGame).toBe(true)
    })

    it('names the difficulty a generate in flight is for, and nothing for another task', () => {
      expect(selectGenerating(INITIAL_STATE)).toBeNull()
      const generating = run(INITIAL_STATE, [{ type: 'newGame', difficulty: 'hard' }])
      expect(selectGenerating(generating)).toBe('hard')
      expect(selectGenerating({ ...generating, pending: { id: 1, task: 'solve' } })).toBeNull()
    })
  })

  describe('key context', () => {
    it('gives the keymap its game facts', () => {
      expect(selectKeyContext(start())).toEqual({
        gridReadOnly: false,
        canUndo: true,
        canSticky: true,
        stickyLocked: false,
        walkthrough: false,
      })
      const locked = run(start(), [{ type: 'toggleSticky' }, { type: 'pad', digit: 4 }])
      expect(selectKeyContext(locked).stickyLocked).toBe(true)
      expect(selectKeyContext(walkthrough([]))).toMatchObject({
        gridReadOnly: true,
        canUndo: false,
        canSticky: false,
        walkthrough: true,
      })
      const won = run(start(solvedExcept(0)), [select(0), digit(5)])
      expect(selectKeyContext(won)).toMatchObject({ gridReadOnly: true, canUndo: true })
    })

    it('maps every key command onto its event', () => {
      expect(fromKey({ kind: 'digit', digit: 3 })).toEqual({ type: 'digit', digit: 3 })
      expect(fromKey({ kind: 'erase', how: 'backspace' })).toEqual({
        type: 'erase',
        how: 'backspace',
      })
      expect(fromKey({ kind: 'move', direction: 'up' })).toEqual({ type: 'move', direction: 'up' })
      expect(fromKey({ kind: 'step', delta: -1 })).toEqual({ type: 'step', delta: -1 })
      for (const kind of ['cycleMode', 'toggleSticky', 'releaseSticky', 'undo', 'redo'] as const) {
        expect(fromKey({ kind })).toEqual({ type: kind })
      }
    })

    it('knows the technique ids', () => {
      expect(isTechnique('X-Wing')).toBe(true)
      expect(isTechnique('Guess')).toBe(false)
    })
  })

  describe('board change', () => {
    const near = (...open: number[]) => start(solvedExcept(...open))

    it('reads a placement and the peers whose notes it removed', () => {
      const noted = run(INITIAL_STATE, [
        { type: 'enterCustom' },
        { type: 'setMode', mode: 'candidate' },
        select(3),
        digit(4),
        { type: 'setMode', mode: 'normal' },
        select(2),
      ])
      const change = selectBoardChange(noted, run(noted, [digit(4)]))
      expect(change.move).toEqual({ index: 2, kind: 'place', touched: [at(2), at(3)] })
      expect(change.moment).toBeNull()
    })

    it('reads a note as a mark move, and an erase as no move', () => {
      const ready = run(start(), [{ type: 'setMode', mode: 'center' }, select(2)])
      expect(selectBoardChange(ready, run(ready, [digit(1)])).move).toEqual({
        index: 2,
        kind: 'mark',
        touched: [at(2)],
      })
      const placed = run(start(), [select(2), digit(4)])
      expect(
        selectBoardChange(placed, run(placed, [{ type: 'erase', how: 'delete' }])).move,
      ).toBeNull()
    })

    it('plays nothing when the board did not change, or in the walkthrough', () => {
      const state = start()
      expect(selectBoardChange(state, run(state, [select(2)]))).toEqual({
        move: null,
        moment: null,
      })
      const walk = walkthrough([])
      expect(selectBoardChange(walk, run(walk, [{ type: 'viewStep', cursor: 0 }]))).toEqual({
        move: null,
        moment: null,
      })
    })

    it('sweeps a row completed by a correct digit, in row order', () => {
      const prev = run(near(0, 10, 72), [select(0)])
      const moment = selectBoardChange(prev, run(prev, [digit(5)])).moment
      expect(moment?.kind).toBe('sweep')
      expect([...(moment?.delays ?? [])]).toEqual(Array.from({ length: 9 }, (_, i) => [i, i * 25]))
    })

    it('sweeps every unit one placement completes, a shared cell taking its earliest start', () => {
      const prev = run(near(0, 80), [select(0)])
      const moment = selectBoardChange(prev, run(prev, [digit(5)])).moment
      expect(moment?.delays.size).toBe(21)
      expect(moment?.delays.get(at(9))).toBe(25)
      expect(moment?.delays.get(at(20))).toBe(200)
    })

    it('sweeps nothing for a wrong digit or a placement completing no unit', () => {
      const prev = run(near(0, 10, 72), [select(0)])
      expect(selectBoardChange(prev, run(prev, [digit(4)])).moment).toBeNull()
      const open = run(near(0, 1, 10, 72), [select(0)])
      expect(selectBoardChange(open, run(open, [digit(5)])).moment).toBeNull()
    })

    it('ripples outward from the winning cell instead of sweeping', () => {
      const prev = run(near(40), [select(40)])
      const moment = selectBoardChange(prev, run(prev, [digit(5)])).moment
      expect(moment?.kind).toBe('ripple')
      expect(moment?.delays.size).toBe(81)
      expect(moment?.delays.get(at(41))).toBe(RIPPLE_STAGGER_MS)
      expect(moment?.delays.get(at(0))).toBe(Math.round(Math.hypot(4, 4) * RIPPLE_STAGGER_MS))
    })

    it('marks what an undo or redo changed, and never sweeps or ripples for it', () => {
      const won = run(near(0, 80), [select(0), digit(5), select(80), digit(9)])
      const undone = run(won, [{ type: 'undo' }])
      const reverted = selectBoardChange(won, undone).moment
      expect(reverted?.kind).toBe('revert')
      expect([...(reverted?.delays.keys() ?? [])]).toEqual([80])
      expect(selectBoardChange(undone, run(undone, [{ type: 'redo' }])).moment?.kind).toBe('revert')
    })

    it('reveals the givens of a new puzzle box by box, and only digits new to a validated board', () => {
      const typing = run(INITIAL_STATE, [{ type: 'enterCustom' }])
      const next = run(
        {
          ...typing,
          pool: {
            ...EMPTY_POOL,
            easy: [{ puzzleString: `5${'.'.repeat(79)}9`, solutionString: SOLUTION }],
          },
        },
        [{ type: 'newGame', difficulty: 'easy' }],
      )
      const moment = selectBoardChange(typing, next).moment
      expect([...(moment?.delays ?? [])]).toEqual([
        [0, 0],
        [80, 240],
      ])
      const typed = run(INITIAL_STATE, [
        { type: 'enterCustom' },
        select(0),
        digit(5),
        { type: 'validate' },
      ])
      const validated = run(typed, [{ type: 'validated', id: 1, solution: board(SOLUTION) }])
      expect(selectBoardChange(typed, validated).moment).toBeNull()
    })

    it('plays nothing while typing a puzzle in or without a solution', () => {
      const typing = run(INITIAL_STATE, [{ type: 'enterCustom' }, select(0), digit(5)])
      expect(selectBoardChange(typing, run(typing, [digit(3)])).moment).toBeNull()
      const resumed = run(INITIAL_STATE, [
        {
          type: 'loaded',
          slices: {
            game: {
              status: 'ok',
              value: {
                history: { past: [], present: board(solvedExcept(0, 10, 72)), future: [] },
                puzzle: board(solvedExcept(0, 10, 72)),
                solution: null,
                difficulty: null,
              },
            },
            metrics: { status: 'absent' },
            pool: { status: 'absent' },
          },
        },
        select(0),
      ])
      expect(selectBoardChange(resumed, run(resumed, [digit(5)])).moment).toBeNull()
    })
  })
})
