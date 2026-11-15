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

import {
  type Board,
  boardToString,
  candidatesAt,
  centersAt,
  EMPTY_BOARD,
  isGiven,
  parseBoard,
  valueAt,
} from '../board'
import { STOPPED_CLOCK } from '../clock'
import { readGame, readMetrics, readPool, STORAGE_KEYS, writeGame } from '../codec/storage'
import { type CellIndex, type Digit, maskOf } from '../digits'
import { MAX_HISTORY } from '../history'
import { EMPTY_POOL, MAX_POOL_SIZE, type Pool } from '../pool'
import type { Effect } from './effects'
import type { Event } from './events'
import { serialize } from './persist'
import { INITIAL_STATE, type Play, playOf, type State } from './state'
import type { SolveResult, Step } from './steps'
import { METRICS_EVERY_SECONDS, update } from './update'

const PUZZLE = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79'
const SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
/** The solution with its first cell open, one digit from a win. */
const NEAR = `.${SOLUTION.slice(1)}`
const T0 = 1_000_000

const at = (n: number) => n as CellIndex
const board = (text: string) => parseBoard(text) as Board
const entry = (puzzleString: string, solutionString = SOLUTION) => ({
  puzzleString,
  solutionString,
})
const poolOf = (...puzzles: string[]): Pool => ({
  ...EMPTY_POOL,
  easy: puzzles.map((p) => entry(p)),
})

interface Run {
  readonly state: State
  readonly effects: Effect[]
}

/** Feeds events one by one, all at `now`, and collects every effect. */
function run(state: State, events: readonly Event[], now = T0): Run {
  const effects: Effect[] = []
  let current = state
  for (const event of events) {
    const out = update(current, event, now)
    current = out.state
    effects.push(...out.effects)
  }
  return { state: current, effects }
}

const step = (state: State, event: Event, now = T0) => update(state, event, now)

const withPool = (...puzzles: string[]): State => ({ ...INITIAL_STATE, pool: poolOf(...puzzles) })

/** A game of PUZZLE in play from the pool. */
const playing = (puzzle = PUZZLE): State =>
  run(withPool(puzzle), [{ type: 'newGame', difficulty: 'easy' }]).state

const entering = (): State => run(INITIAL_STATE, [{ type: 'enterCustom' }]).state

const play = (state: State): Play => playOf(state.game) as Play
const present = (state: State): Board => play(state).history.present
const editBoard = (state: State): Board =>
  state.game.mode === 'entering' ? state.game.history.present : present(state)

const select = (index: number): Event => ({ type: 'select', index: at(index) })
const digit = (d: number): Event => ({ type: 'digit', digit: d as Digit })
const pad = (d: number): Event => ({ type: 'pad', digit: d as Digit })

const kinds = (effects: readonly Effect[]) => effects.map((effect) => effect.kind)
const solverRequest = (effects: readonly Effect[]) =>
  effects.find((effect) => effect.kind === 'solver')

const nakedSingle = (index: number, d: number): Step => ({
  technique: 'NakedSingle',
  placements: [{ index: at(index), digit: d as Digit }],
  eliminations: [],
  cause: [],
})

/** A solve of PUZZLE whose steps place every open cell, one naked single each. */
const fullSolve = (): SolveResult => ({
  steps: Array.from(PUZZLE).flatMap((char, i) =>
    char === '.' ? [nakedSingle(i, Number(SOLUTION[i]))] : [],
  ),
  solution: board(SOLUTION),
})

describe('update', () => {
  describe('placing a digit', () => {
    it('sets the value, clears its own notes and records the board', () => {
      const state = run(playing(), [
        { type: 'setMode', mode: 'candidate' },
        select(2),
        digit(4),
      ]).state
      expect(candidatesAt(present(state), at(2))).toBe(maskOf([4]))
      const placed = run(state, [{ type: 'setMode', mode: 'normal' }, digit(4)]).state
      expect(valueAt(present(placed), at(2))).toBe(4)
      expect(candidatesAt(present(placed), at(2))).toBe(0)
      expect(play(placed).history.past).toHaveLength(2)
    })

    it('counts a digit that disagrees with the solution as a mistake, and a right one as none', () => {
      const wrong = run(playing(), [select(2), digit(1)]).state
      expect(play(wrong).mistakes).toBe(1)
      const right = run(playing(), [select(2), digit(4)]).state
      expect(play(right).mistakes).toBe(0)
    })

    it('counts no mistakes without a known solution', () => {
      const state = run(entering(), [select(0), digit(1)]).state
      expect(state.game.mode).toBe('entering')
      expect(serialize(state, STORAGE_KEYS.METRICS, T0)).toBe('{"timer":0,"mistakes":0}')
    })

    it('wins on the last correct digit', () => {
      const { state, effects } = run(playing(NEAR), [select(0), digit(5)])
      expect(state.game.mode).toBe('won')
      expect(effects).toContainEqual({ kind: 'tick', delayMs: null })
    })

    it('changes nothing when the digit is already there, or the cell is a given', () => {
      const placed = run(playing(), [select(2), digit(4)]).state
      expect(step(placed, digit(4)).state.game).toBe(placed.game)
      const given = run(playing(), [select(0)]).state
      expect(step(given, digit(9)).state.game).toBe(given.game)
    })

    it('clears the digit from peer notes', () => {
      const noted = run(playing(), [
        { type: 'setMode', mode: 'candidate' },
        select(3),
        digit(4),
        select(11),
        digit(4),
      ]).state
      const placed = run(noted, [{ type: 'setMode', mode: 'normal' }, select(2), digit(4)]).state
      expect(candidatesAt(present(placed), at(3))).toBe(0)
      expect(candidatesAt(present(placed), at(11))).toBe(0)
    })

    it('drops the redo tail when a new move follows an undo', () => {
      const state = run(playing(), [
        select(2),
        digit(4),
        digit(1),
        { type: 'undo' },
        digit(2),
      ]).state
      expect(play(state).history.future).toHaveLength(0)
      expect(valueAt(present(state), at(2))).toBe(2)
    })

    it('ignores input with no selected cell or a read-only grid', () => {
      const state = playing()
      expect(step(state, digit(4)).state.game).toBe(state.game)
      const won = run(playing(NEAR), [select(0), digit(5)]).state
      expect(step(won, digit(1)).state).toBe(won)
    })
  })

  describe('notes', () => {
    it('adds and removes a candidate', () => {
      const added = run(playing(), [
        { type: 'setMode', mode: 'candidate' },
        select(2),
        digit(4),
      ]).state
      expect(candidatesAt(present(added), at(2))).toBe(maskOf([4]))
      const removed = step(added, digit(4)).state
      expect(candidatesAt(present(removed), at(2))).toBe(0)
    })

    it('adds and removes a center note, which replaces the candidates', () => {
      const noted = run(playing(), [
        { type: 'setMode', mode: 'candidate' },
        select(2),
        digit(4),
      ]).state
      const centered = run(noted, [{ type: 'setMode', mode: 'center' }, digit(1)]).state
      expect(centersAt(present(centered), at(2))).toBe(maskOf([1]))
      expect(candidatesAt(present(centered), at(2))).toBe(0)
      expect(centersAt(present(step(centered, digit(1)).state), at(2))).toBe(0)
    })

    it('pulses the clashing peers instead of adding a clashing note', () => {
      const ready = run(playing(), [{ type: 'setMode', mode: 'candidate' }, select(2)]).state
      const { state, effects } = step(ready, digit(5))
      expect(state.flash).toEqual({ cells: [at(0)], pulse: 1 })
      expect(effects).toContainEqual({ kind: 'flash', pulse: 1, delayMs: 600 })
      expect(state.game).toBe(ready.game)
      expect(step(state, { type: 'flashEnded', pulse: 0 }).state.flash).not.toBeNull()
      expect(step(state, { type: 'flashEnded', pulse: 1 }).state.flash).toBeNull()
    })

    it('removes an existing note even when a peer now holds its digit', () => {
      const typed = run(entering(), [
        { type: 'setMode', mode: 'center' },
        select(1),
        digit(5),
      ]).state
      const clashing = run(typed, [{ type: 'setMode', mode: 'normal' }, select(0), digit(5)]).state
      const centred = editBoard(clashing)
      expect(centersAt(centred, at(1))).toBe(0)
      const again = run(entering(), [
        { type: 'setMode', mode: 'candidate' },
        select(1),
        digit(5),
        select(2),
        digit(5),
      ]).state
      const removed = run(again, [{ type: 'setMode', mode: 'normal' }, select(9), digit(5)]).state
      const back = run(removed, [{ type: 'setMode', mode: 'candidate' }, select(1), digit(5)]).state
      expect(candidatesAt(editBoard(back), at(1))).toBe(0)
    })

    it('leaves a filled cell and a given alone', () => {
      const filled = run(playing(), [
        select(2),
        digit(4),
        { type: 'setMode', mode: 'candidate' },
      ]).state
      expect(step(filled, digit(1)).state.game).toBe(filled.game)
      const given = run(playing(), [{ type: 'setMode', mode: 'center' }, select(0)]).state
      expect(step(given, digit(1)).state.game).toBe(given.game)
    })
  })

  describe('auto-fill', () => {
    it('writes every empty cell its candidates and clears center notes', () => {
      const centred = run(playing(), [
        { type: 'setMode', mode: 'center' },
        select(2),
        digit(1),
      ]).state
      const filled = step(centred, { type: 'autoFill' }).state
      expect(candidatesAt(present(filled), at(2))).toBe(maskOf([1, 2, 4]))
      expect(centersAt(present(filled), at(2))).toBe(0)
      expect(step(filled, { type: 'autoFill' }).state).toBe(filled)
    })

    it('does nothing outside play', () => {
      const state = entering()
      expect(step(state, { type: 'autoFill' }).state).toBe(state)
    })
  })

  describe('erasing', () => {
    it('clears the value and the notes, staying on delete and moving left on backspace', () => {
      const placed = run(playing(), [select(3), digit(6)]).state
      const deleted = step(placed, { type: 'erase', how: 'delete' }).state
      expect(valueAt(present(deleted), at(3))).toBeNull()
      expect(deleted.input.selected).toBe(3)
      const backed = step(placed, { type: 'erase', how: 'backspace' }).state
      expect(backed.input.selected).toBe(2)
    })

    it('does nothing on an empty cell, without a selection or on a given', () => {
      const empty = run(playing(), [select(2)]).state
      expect(step(empty, { type: 'erase', how: 'delete' }).state).toBe(empty)
      const none = playing()
      expect(step(none, { type: 'erase', how: 'delete' }).state).toBe(none)
      const given = run(playing(), [select(1)]).state
      expect(step(given, { type: 'erase', how: 'delete' }).state).toBe(given)
    })

    it('moves left on backspace from a given without erasing it, and stays at the first cell', () => {
      const given = run(playing(), [select(1)]).state
      const moved = step(given, { type: 'erase', how: 'backspace' }).state
      expect(moved.input.selected).toBe(0)
      expect(valueAt(present(moved), at(1))).toBe(3)
      expect(step(moved, { type: 'erase', how: 'backspace' }).state.input.selected).toBe(0)
    })
  })

  describe('clearing the board', () => {
    it('resets play to the puzzle as one undoable move, keeping the metrics', () => {
      const progressed = run(playing(), [select(2), digit(1), select(3), digit(6)]).state
      const cleared = step(progressed, { type: 'clear' }).state
      expect(boardToString(present(cleared))).toBe(PUZZLE)
      expect(play(cleared).mistakes).toBe(1)
      expect(cleared.input.selected).toBeNull()
      expect(valueAt(present(step(cleared, { type: 'undo' }).state), at(3))).toBe(6)
    })

    it('does nothing without progress', () => {
      const state = playing()
      expect(step(state, { type: 'clear' }).state).toBe(state)
      const empty = entering()
      expect(step(empty, { type: 'clear' }).state).toBe(empty)
    })

    it('empties a typed-in puzzle', () => {
      const typed = run(entering(), [select(0), digit(5)]).state
      const cleared = step(typed, { type: 'clear' }).state
      expect(editBoard(cleared)).toBe(EMPTY_BOARD)
    })

    it('resets a won board back to play', () => {
      const won = run(playing(NEAR), [select(0), digit(5)]).state
      expect(step(won, { type: 'clear' }).state.game.mode).toBe('playing')
    })

    it('does nothing in the walkthrough or on the selection screen', () => {
      expect(step(INITIAL_STATE, { type: 'clear' }).state).toBe(INITIAL_STATE)
      const walk = walkthrough()
      expect(step(walk, { type: 'clear' }).state).toBe(walk)
    })
  })

  describe('history', () => {
    it('undoes and redoes, stopping at either end', () => {
      const state = run(playing(), [select(2), digit(4), select(3), digit(6)]).state
      const back = run(state, [{ type: 'undo' }, { type: 'undo' }, { type: 'undo' }]).state
      expect(boardToString(present(back))).toBe(PUZZLE)
      const forward = run(back, [{ type: 'redo' }, { type: 'redo' }, { type: 'redo' }]).state
      expect(present(forward)).toBe(present(state))
    })

    it('keeps at most MAX_HISTORY boards', () => {
      let state = run(entering(), [select(0)]).state
      for (let i = 0; i < MAX_HISTORY + 5; i++) state = step(state, digit((i % 9) + 1)).state
      const history = state.game.mode === 'entering' ? state.game.history : null
      expect(history?.past).toHaveLength(MAX_HISTORY - 1)
    })

    it('steps a won board back into play, and redo wins again', () => {
      const won = run(playing(NEAR), [select(0), digit(5)]).state
      const undone = step(won, { type: 'undo' }).state
      expect(undone.game.mode).toBe('playing')
      expect(step(undone, { type: 'redo' }).state.game.mode).toBe('won')
    })

    it('is refused while paused', () => {
      const paused = run(playing(), [select(2), digit(4), { type: 'pause' }]).state
      expect(step(paused, { type: 'undo' }).state).toBe(paused)
    })
  })

  describe('selection and moves', () => {
    it('selects a cell and shades its digit, or deselects and drops the shading', () => {
      const state = step(playing(), select(0)).state
      expect(state.input).toMatchObject({ selected: 0, highlight: 5 })
      expect(step(state, { type: 'select', index: null }).state.input).toMatchObject({
        selected: null,
        highlight: null,
      })
    })

    it('refuses a selection on a read-only grid but always deselects', () => {
      const walk = walkthrough()
      expect(step(walk, select(3)).state).toBe(walk)
      expect(step(INITIAL_STATE, { type: 'select', index: null }).state.input.selected).toBeNull()
    })

    it('moves one cell, wrapping between rows and stopping at the edges', () => {
      const corner = run(playing(), [select(8)]).state
      expect(step(corner, { type: 'move', direction: 'right' }).state.input.selected).toBe(9)
      expect(step(corner, { type: 'move', direction: 'up' }).state).toBe(corner)
      const last = run(playing(), [select(80)]).state
      expect(step(last, { type: 'move', direction: 'down' }).state).toBe(last)
      expect(step(last, { type: 'move', direction: 'left' }).state.input.selected).toBe(79)
    })

    it('does not move without a selection', () => {
      const state = playing()
      expect(step(state, { type: 'move', direction: 'up' }).state).toBe(state)
    })

    it('sets and cycles the input mode, wrapping back to normal', () => {
      const state = step(playing(), { type: 'setMode', mode: 'center' }).state
      expect(state.input.mode).toBe('center')
      expect(step(state, { type: 'cycleMode' }).state.input.mode).toBe('normal')
      expect(step(playing(), { type: 'cycleMode' }).state.input.mode).toBe('candidate')
    })
  })

  describe('typing a puzzle in', () => {
    it('advances after a valid digit but not after a clashing one or at the last cell', () => {
      const typed = run(entering(), [select(0), digit(5)]).state
      expect(typed.input.selected).toBe(1)
      expect(typed.input.highlight).toBe(5)
      const clash = run(typed, [digit(5)]).state
      expect(clash.input.selected).toBe(1)
      const last = run(entering(), [select(80), digit(9)]).state
      expect(last.input.selected).toBe(80)
    })

    it('stays on the cell after a digit in play', () => {
      expect(run(playing(), [select(2), digit(4)]).state.input.selected).toBe(2)
    })

    it('edits a digit that would be a given in play', () => {
      const typed = run(entering(), [{ type: 'paste', text: PUZZLE }, select(0), digit(1)]).state
      expect(valueAt(editBoard(typed), at(0))).toBe(1)
    })
  })

  describe('number pad', () => {
    it('shades its digit before entering it, so a typed-in advance shades the next cell', () => {
      const state = run(entering(), [select(0), pad(5)]).state
      expect(state.input).toMatchObject({ selected: 1, highlight: null })
      expect(step(playing(), pad(4)).state.input.highlight).toBe(4)
    })

    it('is off for a complete digit and on a read-only grid', () => {
      const full = run(playing(NEAR), [select(0)]).state
      expect(step(full, pad(9)).state).toBe(full)
      const walk = walkthrough()
      expect(step(walk, pad(1)).state).toBe(walk)
    })
  })

  describe('generating', () => {
    it('starts a pooled puzzle at once, taking it from the pool', () => {
      const { state, effects } = run(withPool(PUZZLE, NEAR), [
        { type: 'newGame', difficulty: 'easy' },
      ])
      expect(state.game.mode).toBe('playing')
      expect(play(state).difficulty).toBe('easy')
      expect(state.pool.easy).toEqual([entry(NEAR)])
      expect(kinds(effects)).toEqual(['tick', 'save', 'save', 'save', 'refill'])
      expect(effects).toContainEqual({ kind: 'refill', pool: state.pool })
    })

    it('reads dots in a pooled solution as gaps, which never win', () => {
      const state = run(
        { ...INITIAL_STATE, pool: { ...EMPTY_POOL, easy: [entry(NEAR, `.${SOLUTION.slice(1)}`)] } },
        [{ type: 'newGame', difficulty: 'easy' }, select(0), digit(5)],
      ).state
      expect(state.game.mode).toBe('playing')
      expect(play(state).mistakes).toBe(1)
    })

    it('asks the generator when the pool is empty, keeping the current game until it answers', () => {
      const current = playing()
      const { state, effects } = step(
        { ...current, pool: EMPTY_POOL },
        { type: 'newGame', difficulty: 'hard' },
      )
      expect(state.game).toBe(current.game)
      expect(state.pending).toEqual({ id: 1, task: 'generate', difficulty: 'hard' })
      expect(effects).toEqual([
        { kind: 'solver', id: 1, task: { kind: 'generate', difficulty: 'hard' } },
      ])
      const done = step(state, { type: 'generated', id: 1, puzzle: entry(PUZZLE) })
      expect(done.state.pending).toBeNull()
      expect(play(done.state).difficulty).toBe('hard')
      expect(done.effects).toContainEqual({ kind: 'toast', message: 'generated', tone: 'success' })
    })

    it('treats a pooled puzzle that does not parse as an empty pool', () => {
      const state = { ...INITIAL_STATE, pool: { ...EMPTY_POOL, easy: [entry('bad')] } }
      expect(step(state, { type: 'newGame', difficulty: 'easy' }).state.pending?.task).toBe(
        'generate',
      )
    })

    it('reports a failed or unreadable generation and keeps the game', () => {
      const asked = step(INITIAL_STATE, { type: 'newGame', difficulty: 'easy' }).state
      const failed = step(asked, { type: 'failed', id: 1, reason: 'boom' })
      expect(failed.state.game.mode).toBe('selecting')
      expect(failed.effects).toEqual([{ kind: 'toast', message: 'generateFailed', tone: 'error' }])
      const bad = step(asked, { type: 'generated', id: 1, puzzle: entry('bad') })
      expect(bad.effects).toEqual([{ kind: 'toast', message: 'generateFailed', tone: 'error' }])
    })

    it('ignores a reply for another request, and a new request cancels the old', () => {
      const asked = step(INITIAL_STATE, { type: 'newGame', difficulty: 'easy' }).state
      expect(step(asked, { type: 'generated', id: 7, puzzle: entry(PUZZLE) }).state).toBe(asked)
      const again = step(asked, { type: 'newGame', difficulty: 'hard' })
      expect(again.effects[0]).toEqual({ kind: 'cancel', id: 1 })
      expect(step(again.state, { type: 'generated', id: 1, puzzle: entry(PUZZLE) }).state).toBe(
        again.state,
      )
    })

    it('ignores a reply whose kind does not match the request', () => {
      const asked = step(INITIAL_STATE, { type: 'newGame', difficulty: 'easy' }).state
      expect(step(asked, { type: 'solved', id: 1, result: fullSolve() }).state).toBe(asked)
      expect(step(asked, { type: 'validated', id: 1, solution: null }).state).toBe(asked)
      const validating = run(entering(), [select(0), digit(5), { type: 'validate' }]).state
      const id = validating.pending?.id ?? 0
      expect(step(validating, { type: 'generated', id, puzzle: entry(PUZZLE) }).state).toBe(
        validating,
      )
    })

    it('resets selection, input mode and lock, but keeps sticky numbers', () => {
      const set = run(withPool(PUZZLE, PUZZLE), [
        { type: 'newGame', difficulty: 'easy' },
        { type: 'toggleSticky' },
        pad(1),
        { type: 'setMode', mode: 'center' },
        select(2),
        { type: 'newGame', difficulty: 'easy' },
      ]).state
      expect(set.input).toEqual({
        selected: null,
        mode: 'normal',
        highlight: null,
        sticky: true,
        stickyDigit: null,
      })
    })

    it('adds refilled puzzles per difficulty up to the pool cap', () => {
      const puzzles = Array.from({ length: MAX_POOL_SIZE + 2 }, () => ({
        difficulty: 'hard' as const,
        ...entry(PUZZLE),
      }))
      const { state, effects } = step(INITIAL_STATE, { type: 'refilled', puzzles })
      expect(state.pool.hard).toHaveLength(MAX_POOL_SIZE)
      expect(effects).toEqual([
        { kind: 'save', key: STORAGE_KEYS.POOL, when: 'now' },
        { kind: 'refill', pool: state.pool },
      ])
    })
  })

  describe('custom puzzles', () => {
    it('opens an empty board for entry with the clock stopped', () => {
      const state = entering()
      expect(state.game).toEqual({
        mode: 'entering',
        history: { past: [], present: EMPTY_BOARD, future: [] },
      })
    })

    it('validates a typed board and starts it as a custom game with its digits as givens', () => {
      const typed = run(entering(), [select(0), digit(5), { type: 'setMode', mode: 'candidate' }])
      const asked = step(typed.state, { type: 'validate' })
      expect(asked.effects).toEqual([
        { kind: 'solver', id: 1, task: { kind: 'validate', puzzle: `5${'.'.repeat(80)}` } },
      ])
      const done = step(
        asked.state,
        { type: 'validated', id: 1, solution: board(SOLUTION) },
        T0 + 5,
      )
      expect(done.state.game.mode).toBe('playing')
      expect(isGiven(present(done.state), at(0))).toBe(true)
      expect(play(done.state).difficulty).toBeNull()
      expect(done.state.input.mode).toBe('candidate')
      expect(done.effects).toContainEqual({ kind: 'toast', message: 'validated', tone: 'success' })
      expect(play(done.state).clock).toEqual({ elapsedMs: 0, runningSince: T0 + 5 })
    })

    it('refuses an empty board or a second validation', () => {
      const empty = entering()
      expect(step(empty, { type: 'validate' }).state).toBe(empty)
      const asked = run(entering(), [select(0), digit(5), { type: 'validate' }]).state
      expect(step(asked, { type: 'validate' }).state).toBe(asked)
    })

    it('stays in entry on an invalid puzzle or a validator error', () => {
      const asked = run(entering(), [select(0), digit(5), { type: 'validate' }]).state
      const invalid = step(asked, { type: 'validated', id: 1, solution: null })
      expect(invalid.state.game.mode).toBe('entering')
      expect(invalid.state.pending).toBeNull()
      expect(invalid.effects).toEqual([{ kind: 'toast', message: 'invalidPuzzle', tone: 'error' }])
      const failed = step(asked, { type: 'failed', id: 1, reason: 'x' })
      expect(failed.effects).toEqual([{ kind: 'toast', message: 'validateFailed', tone: 'error' }])
    })

    it('ignores a validation reply once entry was left', () => {
      const asked = run(entering(), [select(0), digit(5), { type: 'validate' }]).state
      const left = { ...asked, game: playing().game }
      expect(step(left, { type: 'validated', id: 1, solution: board(SOLUTION) }).state.game).toBe(
        left.game,
      )
    })

    it('freezes the grid while validating', () => {
      const asked = run(entering(), [select(0), digit(5), { type: 'validate' }]).state
      expect(step(asked, digit(3)).state).toBe(asked)
    })
  })

  describe('paste', () => {
    it('imports a puzzle while one is typed in, and offers it during play', () => {
      const imported = step(entering(), {
        type: 'paste',
        text: ` ${PUZZLE.slice(0, 40)}\n${PUZZLE.slice(40)} `,
      })
      expect(boardToString(editBoard(imported.state))).toBe(PUZZLE)
      expect(imported.effects).toContainEqual({
        kind: 'toast',
        message: 'imported',
        tone: 'success',
      })
      const offered = step(playing(), { type: 'paste', text: SOLUTION }).state
      expect(offered.offer).toBe(SOLUTION)
    })

    it('reports a malformed paste and ignores one outside an editable board', () => {
      expect(step(playing(), { type: 'paste', text: 'nope' }).effects).toEqual([
        { kind: 'toast', message: 'badPaste', tone: 'error' },
      ])
      expect(step(INITIAL_STATE, { type: 'paste', text: PUZZLE }).state).toBe(INITIAL_STATE)
    })

    it('cancels a validation the import replaces', () => {
      const asked = run(entering(), [select(0), digit(5), { type: 'validate' }]).state
      expect(step(asked, { type: 'paste', text: PUZZLE }).effects[0]).toEqual({
        kind: 'cancel',
        id: 1,
      })
    })
  })

  describe('shared puzzles', () => {
    it('offers a linked puzzle and strips it from the address', () => {
      const { state, effects } = step(INITIAL_STATE, {
        type: 'opened',
        search: `?p=${PUZZLE}&x=1`,
        href: `https://wasudoku.test/?p=${PUZZLE}&x=1#top`,
      })
      expect(state.offer).toBe(PUZZLE)
      expect(effects).toEqual([{ kind: 'replaceUrl', href: 'https://wasudoku.test/?x=1#top' }])
    })

    it('does nothing without a valid puzzle in the address', () => {
      expect(
        step(INITIAL_STATE, { type: 'opened', search: '?p=12', href: 'https://a.test/?p=12' })
          .state,
      ).toBe(INITIAL_STATE)
    })

    it('declines an offer, keeping the game', () => {
      const offered = step(playing(), { type: 'paste', text: SOLUTION }).state
      const declined = step(offered, { type: 'declineOffer' }).state
      expect(declined.offer).toBeNull()
      expect(declined.game).toBe(offered.game)
    })

    it('accepts an offer into validation, keeping the pool', () => {
      const offered = {
        ...step(INITIAL_STATE, { type: 'opened', search: `?p=${PUZZLE}`, href: 'https://a.test/' })
          .state,
        pool: poolOf(NEAR),
      }
      const { state, effects } = step(offered, { type: 'acceptOffer' })
      expect(state.game.mode).toBe('entering')
      expect(boardToString(editBoard(state))).toBe(PUZZLE)
      expect(state.offer).toBeNull()
      expect(state.pool).toBe(offered.pool)
      expect(state.pending).toEqual({ id: 1, task: 'validate' })
      expect(solverRequest(effects)).toEqual({
        kind: 'solver',
        id: 1,
        task: { kind: 'validate', puzzle: PUZZLE },
      })
    })

    it('cancels the request in flight when an offer is accepted, and ignores an accept with no offer', () => {
      const asked = step(INITIAL_STATE, { type: 'newGame', difficulty: 'easy' }).state
      const accepted = step({ ...asked, offer: PUZZLE }, { type: 'acceptOffer' })
      expect(accepted.effects[0]).toEqual({ kind: 'cancel', id: 1 })
      expect(step(INITIAL_STATE, { type: 'acceptOffer' }).state).toBe(INITIAL_STATE)
    })
  })

  describe('copying', () => {
    it('exports the board with progress and shares the puzzle without it', () => {
      const progressed = run(playing(), [select(2), digit(4)]).state
      expect(step(progressed, { type: 'export' }).effects).toEqual([
        { kind: 'copy', text: `534${PUZZLE.slice(3)}`, message: 'exported' },
      ])
      expect(step(progressed, { type: 'share', href: 'https://a.test/x?y=1#z' }).effects).toEqual([
        { kind: 'copy', text: `https://a.test/x?p=${PUZZLE}`, message: 'linkCopied' },
      ])
    })

    it('shares the typed-in board, and an empty one from the selection screen', () => {
      const typed = run(entering(), [select(0), digit(5)]).state
      const shared = step(typed, { type: 'share', href: 'https://a.test/' }).effects[0]
      expect(shared).toEqual({
        kind: 'copy',
        text: `https://a.test/?p=5${'.'.repeat(80)}`,
        message: 'linkCopied',
      })
      expect(step(INITIAL_STATE, { type: 'export' }).effects[0]).toEqual({
        kind: 'copy',
        text: '.'.repeat(81),
        message: 'exported',
      })
      expect(
        step(INITIAL_STATE, { type: 'share', href: 'https://a.test/' }).effects[0],
      ).toMatchObject({ text: `https://a.test/?p=${'.'.repeat(81)}` })
    })
  })

  describe('hints', () => {
    it('points at the first wrong digit without asking the solver', () => {
      const { state, effects } = run(playing(), [
        select(3),
        digit(1),
        select(2),
        digit(9),
        { type: 'hint' },
      ])
      expect(state.game).toMatchObject({ hint: { kind: 'mistake', index: 2 } })
      expect(solverRequest(effects)).toBeUndefined()
    })

    it('asks the solver for the current board when every digit is right', () => {
      const { state, effects } = run(playing(), [{ type: 'hint' }])
      expect(state.pending).toEqual({ id: 1, task: 'hint' })
      expect(solverRequest(effects)).toEqual({
        kind: 'solver',
        id: 1,
        task: { kind: 'solve', puzzle: PUZZLE },
      })
    })

    it('keeps only the first step of the reply', () => {
      const asked = run(playing(), [{ type: 'hint' }]).state
      const result = fullSolve()
      const state = step(asked, { type: 'solved', id: 1, result }).state
      expect(state.game).toMatchObject({ hint: { kind: 'step', step: result.steps[0] } })
      expect(state.pending).toBeNull()
    })

    it('reveals the first empty cell when logic finds no step', () => {
      const asked = run(playing(), [{ type: 'hint' }]).state
      const state = step(asked, {
        type: 'solved',
        id: 1,
        result: { steps: [], solution: board(SOLUTION) },
      }).state
      expect(state.game).toMatchObject({ hint: { kind: 'reveal', index: 2, digit: 4 } })
    })

    it('falls back to the reply solution when the game has none', () => {
      const custom = {
        ...playing(),
        game: { ...playing().game, play: { ...play(playing()), solution: null } },
      } as State
      const asked = step(custom, { type: 'hint' }).state
      const state = step(asked, {
        type: 'solved',
        id: 1,
        result: { steps: [], solution: board(SOLUTION) },
      }).state
      expect(state.game).toMatchObject({ hint: { kind: 'reveal', index: 2, digit: 4 } })
    })

    it('reports no hint when nothing can be revealed, or the solver fails', () => {
      const asked = run(playing(), [{ type: 'hint' }]).state
      const failed = step(asked, { type: 'failed', id: 1, reason: 'x' })
      expect(failed.effects).toEqual([{ kind: 'toast', message: 'noHint', tone: 'error' }])
      const custom = {
        ...playing(),
        game: { ...playing().game, play: { ...play(playing()), solution: null } },
      } as State
      const full = {
        ...custom,
        game: {
          ...custom.game,
          play: { ...play(custom), history: { past: [], present: board(SOLUTION), future: [] } },
        },
      } as State
      const gap = step(step(custom, { type: 'hint' }).state, {
        type: 'solved',
        id: 1,
        result: { steps: [], solution: board(PUZZLE) },
      })
      expect(gap.effects).toEqual([{ kind: 'toast', message: 'noHint', tone: 'error' }])
      const asks = step(full, { type: 'hint' }).state
      expect(
        step(asks, { type: 'solved', id: 1, result: { steps: [], solution: board(SOLUTION) } })
          .effects,
      ).toEqual([{ kind: 'toast', message: 'noHint', tone: 'error' }])
    })

    it('drops a late reply once the game is no longer in play', () => {
      const asked = run(playing(), [{ type: 'hint' }]).state
      const walked = { ...asked, game: walkthrough().game }
      expect(step(walked, { type: 'solved', id: 1, result: fullSolve() }).state.game).toBe(
        walked.game,
      )
    })

    it('clears on dismiss and on any board edit, cancelling a hint in flight', () => {
      const shown = run(playing(), [select(3), digit(1), { type: 'hint' }]).state
      expect(step(shown, { type: 'dismissHint' }).state.game).toMatchObject({ hint: null })
      expect(step(playing(), { type: 'dismissHint' }).state).toEqual(playing())
      const asked = run(playing(), [select(2), { type: 'hint' }]).state
      const { state, effects } = step(asked, digit(4))
      expect(effects[0]).toEqual({ kind: 'cancel', id: 1 })
      expect(state.pending).toBeNull()
      const edited = step(shown, digit(6)).state
      expect(edited.game).toMatchObject({ hint: null })
    })

    it('is refused while paused, after a win or with a request in flight', () => {
      const paused = step(playing(), { type: 'pause' }).state
      expect(step(paused, { type: 'hint' }).state).toBe(paused)
      const asked = step(playing(), { type: 'hint' }).state
      expect(step(asked, { type: 'hint' }).state).toBe(asked)
    })
  })

  describe('pause', () => {
    it('pauses play, drops the selection and stops the clock', () => {
      const selected = run(playing(), [select(2)]).state
      const { state, effects } = step(selected, { type: 'pause' }, T0 + 3_500)
      expect(state.game).toMatchObject({ mode: 'playing', paused: true })
      expect(state.input.selected).toBeNull()
      expect(play(state).clock).toEqual({ elapsedMs: 3_500, runningSince: null })
      expect(effects).toEqual([
        { kind: 'tick', delayMs: null },
        { kind: 'save', key: STORAGE_KEYS.METRICS, when: 'now' },
      ])
    })

    it('resumes the clock, and ignores a pause or resume that does not apply', () => {
      const paused = step(playing(), { type: 'pause' }, T0 + 1_200).state
      const resumed = step(paused, { type: 'resume' }, T0 + 9_000)
      expect(play(resumed.state).clock).toEqual({ elapsedMs: 1_200, runningSince: T0 + 9_000 })
      expect(resumed.effects).toEqual([{ kind: 'tick', delayMs: 800 }])
      expect(step(paused, { type: 'pause' }).state).toBe(paused)
      const state = playing()
      expect(step(state, { type: 'resume' }).state).toBe(state)
    })

    it('pauses and saves at once when the page hides, and saves nothing from the selection screen', () => {
      const { state, effects } = step(playing(), { type: 'hidden' })
      expect(state.game).toMatchObject({ paused: true })
      expect(effects).toEqual([
        { kind: 'save', key: STORAGE_KEYS.GAME, when: 'now' },
        { kind: 'save', key: STORAGE_KEYS.METRICS, when: 'now' },
        { kind: 'tick', delayMs: null },
      ])
      expect(step(INITIAL_STATE, { type: 'hidden' }).effects).toEqual([])
    })

    it('starts the clock on a new game and stops it on a win', () => {
      const started = step(withPool(NEAR), { type: 'newGame', difficulty: 'easy' }, T0)
      expect(started.effects[0]).toEqual({ kind: 'tick', delayMs: 1_000 })
      const won = run(started.state, [select(0), digit(5)], T0 + 61_000).state
      expect(serialize(won, STORAGE_KEYS.METRICS, T0 + 99_000)).toBe('{"timer":61,"mistakes":0}')
    })

    it('reschedules each tick and saves the metrics on every tenth second', () => {
      const state = playing()
      expect(step(state, { type: 'tick' }, T0 + 1_300).effects).toEqual([
        { kind: 'tick', delayMs: 700 },
      ])
      const tenth = T0 + METRICS_EVERY_SECONDS * 1_000
      expect(step(state, { type: 'tick' }, tenth).effects).toEqual([
        { kind: 'tick', delayMs: 1_000 },
        { kind: 'save', key: STORAGE_KEYS.METRICS, when: 'now' },
      ])
      expect(step(entering(), { type: 'tick' }).effects).toEqual([])
      expect(step(step(state, { type: 'pause' }).state, { type: 'tick' }).effects).toEqual([])
    })
  })

  describe('solving', () => {
    it('asks the solver for the board and freezes it meanwhile', () => {
      const { state, effects } = step(playing(), { type: 'solve' })
      expect(state.pending).toEqual({ id: 1, task: 'solve' })
      expect(solverRequest(effects)).toEqual({
        kind: 'solver',
        id: 1,
        task: { kind: 'solve', puzzle: PUZZLE },
      })
      expect(step(state, select(2)).state).toBe(state)
    })

    it('opens the walkthrough on the solution and stops the clock', () => {
      const asked = step(playing(), { type: 'solve' }).state
      const result = fullSolve()
      const { state, effects } = step(asked, { type: 'solved', id: 1, result }, T0 + 2_000)
      expect(state.game.mode).toBe('walkthrough')
      expect(state.game).toMatchObject({
        walk: { steps: result.steps, cursor: result.steps.length },
      })
      expect(effects).toContainEqual({ kind: 'toast', message: 'solved', tone: 'success' })
      expect(effects).toContainEqual({ kind: 'tick', delayMs: null })
      expect(effects).toContainEqual({ kind: 'save', key: STORAGE_KEYS.GAME, when: 'idle' })
    })

    it('appends a backtracking step when logic leaves cells open', () => {
      const asked = step(playing(), { type: 'solve' }).state
      const result = { steps: [nakedSingle(2, 4)], solution: board(SOLUTION) }
      const state = step(asked, { type: 'solved', id: 1, result }).state
      expect(state.game).toMatchObject({ walk: { cursor: 2 } })
      expect(state.game.mode === 'walkthrough' && state.game.walk.steps[1]?.technique).toBe(
        'Backtracking',
      )
    })

    it('marks the board failed until it changes, and reports it', () => {
      const asked = step(playing(), { type: 'solve' }).state
      const { state, effects } = step(asked, { type: 'failed', id: 1, reason: 'no' })
      expect(play(state).solveFailed).toBe(true)
      expect(effects).toEqual([{ kind: 'toast', message: 'solveFailed', tone: 'error' }])
      expect(step(state, { type: 'solve' }).state).toBe(state)
      expect(play(run(state, [select(2), digit(4)]).state).solveFailed).toBe(false)
    })

    it('reports a failure that lands after the game left play', () => {
      const asked = step(playing(), { type: 'solve' }).state
      const left = { ...asked, game: entering().game }
      expect(step(left, { type: 'failed', id: 1, reason: 'no' }).state.game).toBe(left.game)
    })

    it('refuses a board with conflicts, a full board or an empty one', () => {
      const clash = run(playing(), [select(2), digit(5)]).state
      expect(step(clash, { type: 'solve' }).state).toBe(clash)
      expect(step(entering(), { type: 'solve' }).state).toEqual(entering())
    })

    it('drops a solve reply once the game left play', () => {
      const asked = step(playing(), { type: 'solve' }).state
      const left = { ...asked, game: entering().game }
      expect(step(left, { type: 'solved', id: 1, result: fullSolve() }).state.game).toBe(left.game)
    })

    it('opens the walkthrough unpaused when the reply finds the game paused', () => {
      const paused = run(playing(), [{ type: 'solve' }, { type: 'pause' }]).state
      expect(step(paused, { type: 'solved', id: 1, result: fullSolve() }).state.game.mode).toBe(
        'walkthrough',
      )
    })
  })

  describe('walkthrough', () => {
    it('views a position and steps either way, stopping at both ends', () => {
      const walk = walkthrough()
      const total = walk.game.mode === 'walkthrough' ? walk.game.walk.steps.length : 0
      expect(step(walk, { type: 'step', delta: 1 }).state).toBe(walk)
      const start = step(walk, { type: 'viewStep', cursor: 0 }).state
      expect(start.game).toMatchObject({ walk: { cursor: 0 } })
      expect(step(start, { type: 'step', delta: -1 }).state).toBe(start)
      expect(step(start, { type: 'step', delta: 1 }).state.game).toMatchObject({
        walk: { cursor: 1 },
      })
      expect(step(walk, { type: 'viewStep', cursor: total + 1 }).state).toBe(walk)
      expect(step(walk, { type: 'viewStep', cursor: 0.5 }).state).toBe(walk)
    })

    it('does nothing outside the walkthrough', () => {
      const state = playing()
      expect(step(state, { type: 'step', delta: 1 }).state).toBe(state)
      expect(step(state, { type: 'viewStep', cursor: 0 }).state).toBe(state)
      expect(step(state, { type: 'exitWalkthrough' }).state).toBe(state)
    })

    it('exits back to play with the solver solution, resuming the clock', () => {
      const walk = walkthrough()
      const { state, effects } = step(walk, { type: 'exitWalkthrough' }, T0 + 4_000)
      expect(state.game.mode).toBe('playing')
      expect(play(state).solution).toBe(
        walk.game.mode === 'walkthrough' ? walk.game.walk.solution : null,
      )
      expect(state.input.highlight).toBeNull()
      expect(effects).toEqual([{ kind: 'tick', delayMs: 1_000 }])
    })

    it('starts a new game from the walkthrough', () => {
      const state = step(
        { ...walkthrough(), pool: poolOf(NEAR) },
        { type: 'newGame', difficulty: 'easy' },
      ).state
      expect(state.game.mode).toBe('playing')
    })
  })

  describe('sticky numbers', () => {
    const sticky = () => step(playing(), { type: 'toggleSticky' }).state

    it('turns on without locking a digit, and off releasing the lock and shading the selection', () => {
      const on = sticky()
      expect(on.input).toMatchObject({ sticky: true, stickyDigit: null })
      const locked = run(on, [select(0), pad(4)]).state
      expect(locked.input).toMatchObject({ stickyDigit: 4, highlight: 4 })
      const off = step(locked, { type: 'toggleSticky' }).state
      expect(off.input).toMatchObject({ sticky: false, stickyDigit: null, highlight: 5 })
      expect(off.game).toBe(locked.game)
    })

    it('switches the lock, and releases it on the same key or on Escape', () => {
      const locked = run(sticky(), [pad(4), pad(6)]).state
      expect(locked.input.stickyDigit).toBe(6)
      expect(step(locked, pad(6)).state.input).toMatchObject({
        stickyDigit: null,
        highlight: null,
        sticky: true,
      })
      expect(step(locked, { type: 'releaseSticky' }).state.input.stickyDigit).toBeNull()
    })

    it('refuses a lock with the mode off, for a complete digit and while paused', () => {
      const off = playing()
      expect(step(off, { type: 'releaseSticky' }).state).toBe(off)
      const full = run(playing(NEAR), [{ type: 'toggleSticky' }]).state
      expect(step(full, pad(9)).state).toBe(full)
      const paused = run(sticky(), [{ type: 'pause' }]).state
      expect(step(paused, { type: 'toggleSticky' }).state).toBe(paused)
      expect(step(paused, { type: 'releaseSticky' }).state).toBe(paused)
    })

    it('places the locked digit on a tap, keeping the lock, and takes a tap on the same digit back', () => {
      const locked = run(sticky(), [pad(4)]).state
      const placed = step(locked, { type: 'tap', index: at(2) }).state
      expect(valueAt(present(placed), at(2))).toBe(4)
      expect(placed.input).toMatchObject({ selected: 2, stickyDigit: 4, highlight: 4 })
      const back = step(placed, { type: 'tap', index: at(2) }).state
      expect(valueAt(present(back), at(2))).toBeNull()
      const replaced = run(locked, [
        { type: 'tap', index: at(3) },
        pad(6),
        { type: 'tap', index: at(3) },
      ]).state
      expect(valueAt(present(replaced), at(3))).toBe(6)
      expect(play(replaced).mistakes).toBe(1)
    })

    it('only selects a given, and changes nothing with no digit locked', () => {
      const locked = run(sticky(), [pad(4)]).state
      const given = step(locked, { type: 'tap', index: at(0) }).state
      expect(given.input.selected).toBe(0)
      expect(given.game).toBe(locked.game)
      const unlocked = sticky()
      expect(step(unlocked, { type: 'tap', index: at(2) }).state).toBe(unlocked)
    })

    it('toggles a note on a tap in a note mode, pulsing a clash instead', () => {
      const locked = run(sticky(), [pad(4), { type: 'setMode', mode: 'candidate' }]).state
      const noted = step(locked, { type: 'tap', index: at(2) }).state
      expect(candidatesAt(present(noted), at(2))).toBe(maskOf([4]))
      const five = run(locked, [pad(4), pad(5)]).state
      const clash = step(five, { type: 'tap', index: at(2) }).state
      expect(clash.flash?.cells).toEqual([at(0)])
    })

    it('undoes and redoes a tap like any move', () => {
      const placed = run(sticky(), [pad(4), { type: 'tap', index: at(2) }]).state
      const undone = step(placed, { type: 'undo' }).state
      expect(valueAt(present(undone), at(2))).toBeNull()
      expect(valueAt(present(step(undone, { type: 'redo' }).state), at(2))).toBe(4)
    })

    it('keeps the locked shading when the selection moves, and releases once the digit is complete', () => {
      const locked = run(sticky(), [pad(4), select(0)]).state
      expect(locked.input.highlight).toBe(4)
      const near = run(playing(NEAR), [{ type: 'toggleSticky' }]).state
      const almost = {
        ...near,
        game: {
          ...near.game,
          play: {
            ...play(near),
            history: { past: [], present: board(`..${SOLUTION.slice(2)}`), future: [] },
          },
        },
      } as State
      const lockedFive = run(almost, [pad(5), { type: 'tap', index: at(0) }]).state
      expect(lockedFive.input).toMatchObject({ sticky: true, stickyDigit: null })
    })

    it('releases on a new puzzle and when validation starts play, while the mode stays on', () => {
      const locked = run({ ...sticky(), pool: poolOf(PUZZLE) }, [
        pad(4),
        { type: 'newGame', difficulty: 'easy' },
      ]).state
      expect(locked.input).toMatchObject({ sticky: true, stickyDigit: null })
      const typed = run(entering(), [
        { type: 'toggleSticky' },
        select(0),
        digit(5),
        pad(3),
        { type: 'validate' },
      ]).state
      expect(typed.input.stickyDigit).toBeNull()
      const typing = run(entering(), [{ type: 'toggleSticky' }, select(0), digit(5), pad(3)]).state
      const started = step(
        { ...typing, pending: { id: 9, task: 'validate' } },
        { type: 'validated', id: 9, solution: board(SOLUTION) },
      ).state
      expect(started.input).toMatchObject({ sticky: true, stickyDigit: null })
    })
  })

  describe('loading', () => {
    const saved = run(playing(), [select(2), digit(4), select(3), digit(1)]).state
    const slices = (game: string | null, metrics: string | null, pool: string | null) => ({
      game: readGame(game),
      metrics: readMetrics(metrics),
      pool: readPool(pool),
    })

    it('starts on the selection screen from empty storage, writing the pool and metrics', () => {
      const { state, effects } = step(INITIAL_STATE, {
        type: 'loaded',
        slices: slices(null, null, null),
      })
      expect(state).toEqual(INITIAL_STATE)
      expect(effects).toEqual([
        { kind: 'save', key: STORAGE_KEYS.POOL, when: 'now' },
        { kind: 'save', key: STORAGE_KEYS.METRICS, when: 'now' },
        { kind: 'refill', pool: EMPTY_POOL },
      ])
    })

    it('resumes a saved game with its metrics and starts the clock from them', () => {
      const game = serialize(saved, STORAGE_KEYS.GAME, T0)
      const { state, effects } = step(
        INITIAL_STATE,
        {
          type: 'loaded',
          slices: slices(
            game,
            '{"timer":42,"mistakes":2}',
            serialize(saved, STORAGE_KEYS.POOL, T0),
          ),
        },
        T0 + 500,
      )
      expect(state.game.mode).toBe('playing')
      expect(boardToString(present(state))).toBe(boardToString(present(saved)))
      expect(play(state).history.past).toHaveLength(2)
      expect(play(state)).toMatchObject({
        mistakes: 2,
        difficulty: 'easy',
        clock: { elapsedMs: 42_000, runningSince: T0 + 500 },
      })
      expect(effects).toContainEqual({ kind: 'save', key: STORAGE_KEYS.GAME, when: 'idle' })
      expect(effects).toContainEqual({ kind: 'tick', delayMs: 1_000 })
    })

    it('resumes a finished game as won, its clock stopped', () => {
      const won = run(playing(NEAR), [select(0), digit(5)]).state
      const state = step(INITIAL_STATE, {
        type: 'loaded',
        slices: slices(serialize(won, STORAGE_KEYS.GAME, T0), null, null),
      }).state
      expect(state.game.mode).toBe('won')
      expect(play(state).clock).toEqual(STOPPED_CLOCK)
    })

    it('resumes a typed-in puzzle as play with no solution, as the old build did', () => {
      const typed = run(entering(), [select(0), digit(5)]).state
      const state = step(INITIAL_STATE, {
        type: 'loaded',
        slices: slices(serialize(typed, STORAGE_KEYS.GAME, T0), null, null),
      }).state
      expect(state.game.mode).toBe('playing')
      expect(play(state).solution).toBeNull()
    })

    it('writes a legacy game back at once', () => {
      const legacyCell = (value: number | null) => ({
        value,
        isGiven: value !== null,
        candidates: { __dataType: 'Set', value: [] },
        centers: { __dataType: 'Set', value: [] },
      })
      const legacy = JSON.stringify({
        history: {
          stack: [Array.from(PUZZLE).map((c) => legacyCell(c === '.' ? null : Number(c)))],
          index: 0,
        },
      })
      const { effects } = step(INITIAL_STATE, {
        type: 'loaded',
        slices: slices(legacy, null, null),
      })
      expect(effects).toContainEqual({ kind: 'save', key: STORAGE_KEYS.GAME, when: 'now' })
    })

    it('reports each corrupt key and keeps the others', () => {
      const { state, effects } = step(INITIAL_STATE, {
        type: 'loaded',
        slices: slices('{', 'nope', serialize(withPool(PUZZLE), STORAGE_KEYS.POOL, T0)),
      })
      expect(state.game.mode).toBe('selecting')
      expect(state.pool.easy).toHaveLength(1)
      expect(kinds(effects).slice(0, 2)).toEqual(['corrupt', 'corrupt'])
      expect(effects[0]).toMatchObject({ kind: 'corrupt', key: STORAGE_KEYS.GAME })
      const pool = step(INITIAL_STATE, { type: 'loaded', slices: slices(null, null, '[') })
        .effects[0]
      expect(pool).toMatchObject({ kind: 'corrupt', key: STORAGE_KEYS.POOL })
    })
  })

  describe('persistence', () => {
    it('saves the game once idle after a move, never from the selection screen', () => {
      expect(step(playing(), select(2)).effects).toEqual([])
      const moved = run(playing(), [select(2)]).state
      expect(step(moved, digit(4)).effects).toEqual([
        { kind: 'save', key: STORAGE_KEYS.GAME, when: 'idle' },
      ])
      expect(step(INITIAL_STATE, { type: 'toggleSticky' }).effects).toEqual([])
      expect(serialize(INITIAL_STATE, STORAGE_KEYS.GAME, T0)).toBeNull()
    })

    it('saves the metrics at once on a mistake', () => {
      const moved = run(playing(), [select(2)]).state
      expect(step(moved, digit(1)).effects).toEqual([
        { kind: 'save', key: STORAGE_KEYS.GAME, when: 'idle' },
        { kind: 'save', key: STORAGE_KEYS.METRICS, when: 'now' },
      ])
    })

    it('writes the codec formats, the walkthrough with its solver solution', () => {
      const state = playing()
      expect(serialize(state, STORAGE_KEYS.GAME, T0)).toBe(
        writeGame({
          history: play(state).history,
          puzzle: play(state).puzzle,
          solution: board(SOLUTION),
          difficulty: 'easy',
        }),
      )
      const walk = walkthrough()
      expect(readGame(serialize(walk, STORAGE_KEYS.GAME, T0))).toMatchObject({ status: 'ok' })
      expect(serialize(entering(), STORAGE_KEYS.GAME, T0)).toBe(
        writeGame({
          history: { past: [], present: EMPTY_BOARD, future: [] },
          puzzle: EMPTY_BOARD,
          solution: null,
          difficulty: null,
        }),
      )
      expect(serialize(INITIAL_STATE, STORAGE_KEYS.POOL, T0)).toBe(
        '{"puzzlePool":{"easy":[],"medium":[],"hard":[],"expert":[],"extreme":[]}}',
      )
    })
  })
})

/** A game of PUZZLE solved by the solver, its walkthrough at the solution. */
function walkthrough(): State {
  const asked = step(playing(), { type: 'solve' }).state
  return step(asked, { type: 'solved', id: 1, result: fullSolve() }).state
}
