/*
 * Copyright (C) 2026  Henrique Almeida
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

// A whole session through the store with a scripted solver, checked against the e2e save literals.

import { beforeAll, describe, expect, it } from 'vitest'

import { fullPool, PUZZLE, savedGame, SOLUTION, STORAGE_KEYS } from '../../e2e/saves'
import type * as Wire from '../core/codec/wire.types'
import type { Digit } from '../core/digits'
import {
  selectHint,
  selectMode,
  selectStatus,
  selectWalkthrough,
  selectWin,
} from '../core/game/selectors'
import { CELLS } from '../core/geometry'
import type { Task } from '../solver/client'
import { cellsOf, decoded, fakeDeps, fakeSolver, settle } from '../test/runtime-fakes'
import { loadSlices } from './storage'
import { createStore } from './store'

const DOTS = PUZZLE.replaceAll('0', '.')
const SECOND = 1000

interface Saved {
  readonly initialBoard: string
  readonly history: { readonly stack: readonly string[] }
}

const parse = (text: string): Saved => JSON.parse(text) as Saved

/** A board's code as the e2e literal writes it, for a board of puzzle digits and player digits. */
const codeOf = (board: string): string => parse(savedGame({ board })).history.stack[1]

/** The game key after a run of boards, in the e2e literal's own key order. */
const gameSave = (boards: readonly string[], index: number): string =>
  JSON.stringify({
    version: 2,
    history: { stack: boards.map(codeOf), index },
    initialBoard: parse(savedGame()).initialBoard,
    solution: SOLUTION,
    difficulty: 'easy',
  })

const metrics = (timer: number, mistakes: number) => JSON.stringify({ timer, mistakes })

const EMPTY_POOL_SAVE = '{"puzzlePool":{"easy":[],"medium":[],"hard":[],"expert":[],"extreme":[]}}'
/** Generated puzzles keep the solver's dots, which the e2e pool writes as zeros. */
const FULL_POOL_SAVE = fullPool().replaceAll(
  `"puzzleString":"${PUZZLE}"`,
  `"puzzleString":"${DOTS}"`,
)

const withDigit = (board: string, index: number, digit: string) =>
  board.slice(0, index) + digit + board.slice(index + 1)

/** A naked single per empty cell, in reading order, which is all the walkthrough needs. */
function solveOf(cells: Wire.Cells): Wire.SolveResult {
  const steps: Wire.Step[] = []
  cells.forEach((value, index) => {
    if (value === 0) {
      steps.push({
        technique: 'NakedSingle',
        placements: [{ index, value: Number(SOLUTION[index]) }],
        eliminations: [],
        cause: [],
      })
    }
  })
  return { kind: 'solved', steps, solution: cellsOf(SOLUTION) }
}

function answer(task: Task): Promise<unknown> {
  switch (task.kind) {
    case 'generate':
      return Promise.resolve(
        decoded<Wire.GenerateResult>({
          kind: 'generated',
          difficulty: task.difficulty,
          puzzle: cellsOf(DOTS),
          solution: cellsOf(SOLUTION),
        }),
      )
    case 'solve':
      return Promise.resolve(decoded(solveOf(task.cells)))
    case 'validate':
    case 'hint':
      return Promise.reject(new Error(`unexpected ${task.kind}`))
  }
}

describe('a whole session through createStore', () => {
  const fakes = fakeDeps({ solver: fakeSolver(answer) })
  const { storage, timers, deps } = fakes
  const store = createStore(deps)
  const mode = store.select(selectMode)
  let seconds = 0
  let board = PUZZLE
  const boards = [PUZZLE]

  /** Runs idle work and replies until nothing is left. */
  const drain = async () => {
    for (let round = 0; round < 5; round++) {
      timers.runIdle()
      await settle()
    }
  }

  const play = async (index: number, digit: string) => {
    timers.advance(SECOND)
    seconds += 1
    store.dispatch({ type: 'select', index: CELLS[index] })
    store.dispatch({ type: 'digit', digit: Number(digit) as Digit })
    board = withDigit(board, index, digit)
    await drain()
  }

  beforeAll(() => {
    store.dispatch({ type: 'loaded', slices: loadSlices(storage, deps.log) })
    store.dispatch({ type: 'opened', search: '', href: 'https://wasudoku.h3nc4.com/' })
  })

  it('writes an empty pool and zero metrics on a first visit, and no game', () => {
    expect(Object.fromEntries(storage.items)).toEqual({
      [STORAGE_KEYS.POOL]: EMPTY_POOL_SAVE,
      [STORAGE_KEYS.METRICS]: metrics(0, 0),
    })
    expect(mode()).toBe('selecting')
  })

  it('generates the first puzzle in the foreground, then fills the pool in the background', async () => {
    store.dispatch({ type: 'newGame', difficulty: 'easy' })
    await drain()
    expect(mode()).toBe('playing')
    expect(deps.toast).toHaveBeenCalledWith('generated', 'success')
    expect(storage.items.get(STORAGE_KEYS.GAME)).toBe(gameSave(boards, 0))
    expect(storage.items.get(STORAGE_KEYS.POOL)).toBe(FULL_POOL_SAVE)
  })

  it('saves a first move exactly as the e2e save literal holds it', async () => {
    await play(2, SOLUTION[2])
    boards.push(board)
    expect(storage.items.get(STORAGE_KEYS.GAME)).toBe(savedGame({ board }))
  })

  it('counts a wrong digit in the metrics at once, and undo keeps the count', async () => {
    await play(3, SOLUTION[3])
    boards.push(board)
    const beforeMistake = board
    await play(6, '1')
    expect(storage.items.get(STORAGE_KEYS.METRICS)).toBe(metrics(seconds, 1))
    store.dispatch({ type: 'undo' })
    await drain()
    expect(storage.items.get(STORAGE_KEYS.GAME)).toBe(
      gameSave([...boards, board], boards.length - 1),
    )
    board = beforeMistake
    expect(store.select(selectStatus)()?.mistakes).toBe(1)
  })

  it('hints the next single, then solves and steps through the walkthrough', async () => {
    store.dispatch({ type: 'hint' })
    await drain()
    const hint = store.select(selectHint)()
    expect(hint?.kind === 'step' && hint.step.placements).toEqual([{ index: 5, digit: 8 }])
    const writes = storage.writes.length
    store.dispatch({ type: 'solve' })
    await drain()
    const walk = store.select(selectWalkthrough)
    expect(mode()).toBe('walkthrough')
    const last = walk()!.steps.length
    expect(walk()?.cursor).toBe(last)
    store.dispatch({ type: 'step', delta: -1 })
    expect(walk()?.cursor).toBe(last - 1)
    store.dispatch({ type: 'viewStep', cursor: 0 })
    expect(walk()?.atStart).toBe(true)
    store.dispatch({ type: 'step', delta: 1 })
    expect(walk()?.step?.placements).toEqual([{ index: 5, digit: 8 }])
    store.dispatch({ type: 'exitWalkthrough' })
    await drain()
    expect(mode()).toBe('playing')
    expect(storage.writes.slice(writes).map(([key]) => key)).not.toContain(STORAGE_KEYS.POOL)
  })

  it('wins once every cell is played, and saves the finished game and its clock', async () => {
    for (const index of CELLS) {
      if (board[index] === '0') {
        await play(index, SOLUTION[index])
        boards.push(board)
      }
    }
    expect(mode()).toBe('won')
    expect(board).toBe(SOLUTION)
    expect(store.select(selectWin)()).toEqual({ difficulty: 'easy', mistakes: 1 })
    expect(Object.fromEntries(storage.items)).toEqual({
      [STORAGE_KEYS.POOL]: FULL_POOL_SAVE,
      [STORAGE_KEYS.METRICS]: metrics(seconds, 1),
      [STORAGE_KEYS.GAME]: gameSave(boards, boards.length - 1),
    })
    timers.advance(10 * SECOND)
    expect(storage.items.get(STORAGE_KEYS.METRICS)).toBe(metrics(seconds, 1))
    expect(deps.log.error).not.toHaveBeenCalled()
  })
})
