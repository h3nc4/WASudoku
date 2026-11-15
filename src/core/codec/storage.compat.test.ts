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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SudokuAction } from '@/context/sudoku.actions.types'
import {
  encodeGame as oldEncodeGame,
  loadPersistedState,
  saveGame as oldSaveGame,
  saveMetrics as oldSaveMetrics,
  savePool as oldSavePool,
  STORAGE_KEYS as OLD_KEYS,
} from '@/context/sudoku.persistence'
import { initialState, sudokuReducer } from '@/context/sudoku.reducer'
import type {
  BoardState,
  CellState,
  SavedGame as OldGame,
  SudokuState,
} from '@/context/sudoku.types'

import { type Board, boardFromCells, parseBoard } from '../board'
import { maskOf } from '../digits'
import { fromStack, type History } from '../history'
import type { Pool } from '../pool'
import {
  readGame,
  readMetrics,
  readPool,
  type SavedGame,
  STORAGE_KEYS,
  writeGame,
  writeMetrics,
  writePool,
} from './storage'

const toBoard = (board: BoardState): Board =>
  boardFromCells(
    board.map((cell) => ({
      value: cell.value as 1 | null,
      given: cell.isGiven,
      candidates: maskOf([...cell.candidates] as 1[]),
      centers: maskOf([...cell.centers] as 1[]),
    })),
  ) as Board

const toGame = (game: OldGame): SavedGame => ({
  history: fromStack(game.history.stack.map(toBoard), game.history.index) as History,
  puzzle: toBoard(game.initialBoard),
  solution: game.solution === null ? null : parseBoard(game.solution.join('')),
  difficulty: game.difficulty,
})

// Fixtures of sudoku.persistence.test.ts, built in the old model.
const cell = (over: Partial<CellState> = {}): CellState => ({
  value: null,
  isGiven: false,
  candidates: new Set<number>(),
  centers: new Set<number>(),
  ...over,
})

function midGameBoard(shift = 0): BoardState {
  return Array.from({ length: 81 }, (_, i) => {
    const digit = ((i + shift) % 9) + 1
    if (i % 3 === 0) return cell({ value: digit, isGiven: true })
    if (i % 7 === 0) return cell({ value: digit })
    if (i % 5 === 0) return cell({ centers: new Set([digit, (digit % 9) + 1]) })
    return cell({ candidates: new Set([1, 3, 5, digit].filter((d, k, a) => a.indexOf(d) === k)) })
  })
}

const emptyBoard = () => Array.from({ length: 81 }, () => cell())

const sampleGame = (size = 3, index = size - 1): OldGame => {
  const stack = Array.from({ length: size }, (_, i) => midGameBoard(i))
  return {
    history: { stack, index },
    initialBoard: stack[0],
    solution: Array.from({ length: 81 }, (_, i) => (i % 9) + 1),
    difficulty: 'hard',
  }
}

function legacyReplacer(_key: string, value: unknown) {
  return value instanceof Set ? { __dataType: 'Set', value: [...value] } : value
}

const legacyJson = (game: OldGame) =>
  JSON.stringify(
    {
      history: game.history,
      initialBoard: game.initialBoard,
      solution: game.solution,
      difficulty: game.difficulty,
    },
    legacyReplacer,
  )

// Real states, played through the old reducer the way the app saves them.
const SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
const PUZZLE = Array.from(SOLUTION, (d, i) => (i % 4 === 0 ? d : '.')).join('')
const savedOf = (state: SudokuState): OldGame => ({
  history: state.history,
  initialBoard: state.initialBoard,
  solution: state.solver.solution,
  difficulty: state.solver.difficulty,
})

function play(start: SudokuState, actions: SudokuAction[]): OldGame[] {
  const saves: OldGame[] = []
  let state = start
  for (const action of actions) {
    state = sudokuReducer(state, action)
    if (state.solver.gameMode !== 'selecting') saves.push(savedOf(state))
  }
  return saves
}

const at = (index: number): SudokuAction => ({ type: 'SET_ACTIVE_CELL', index })
const input = (value: number): SudokuAction => ({ type: 'INPUT_VALUE', value })
const mode = (inputMode: 'normal' | 'candidate' | 'center'): SudokuAction => ({
  type: 'SET_INPUT_MODE',
  mode: inputMode,
})

const generatedGame = play(initialState, [
  { type: 'GENERATE_PUZZLE_START', difficulty: 'expert' },
  { type: 'GENERATE_PUZZLE_SUCCESS', puzzleString: PUZZLE, solutionString: SOLUTION },
  at(1),
  input(3),
  input(4),
  at(2),
  mode('candidate'),
  input(1),
  input(2),
  input(4),
  mode('center'),
  at(3),
  input(6),
  input(7),
  { type: 'AUTO_FILL_CANDIDATES' },
  { type: 'UNDO' },
  { type: 'UNDO' },
  { type: 'REDO' },
  mode('normal'),
  at(5),
  input(7),
  { type: 'ERASE_ACTIVE_CELL', mode: 'backspace' },
  { type: 'CLEAR_BOARD' },
  { type: 'UNDO' },
])

const customGame = play(initialState, [
  { type: 'START_CUSTOM_PUZZLE' },
  at(0),
  input(5),
  input(3),
  input(5),
  { type: 'IMPORT_BOARD', boardString: PUZZLE },
  { type: 'VALIDATE_PUZZLE_START' },
  { type: 'VALIDATE_PUZZLE_SUCCESS', solutionString: SOLUTION },
  at(1),
  input(3),
])

const longGame = play(
  sudokuReducer(initialState, { type: 'IMPORT_BOARD', boardString: PUZZLE }),
  Array.from({ length: 120 }, (_, i) => [at(1 + (i % 3)), input((i % 9) + 1)]).flat(),
)

const fixtureGames: [string, OldGame][] = [
  ['a one-board game', sampleGame(1)],
  ['a mid-game history', sampleGame(3)],
  ['a history with a redo tail', sampleGame(3, 0)],
  ['a full history', sampleGame(100)],
  ['a game without solution or difficulty', { ...sampleGame(2), solution: null, difficulty: null }],
  [
    'an empty board with a history',
    {
      history: { stack: [emptyBoard(), emptyBoard()], index: 1 },
      initialBoard: emptyBoard(),
      solution: null,
      difficulty: null,
    },
  ],
  [
    'a cleared board over a puzzle',
    {
      history: { stack: [emptyBoard()], index: 0 },
      initialBoard: midGameBoard(),
      solution: null,
      difficulty: null,
    },
  ],
]

const corpus: [string, OldGame][] = [
  ...fixtureGames,
  ...generatedGame.map((game, i): [string, OldGame] => [`generated game, step ${String(i)}`, game]),
  ...customGame.map((game, i): [string, OldGame] => [`custom game, step ${String(i)}`, game]),
  ...longGame
    .filter((_, i) => i % 40 === 0 || i === longGame.length - 1)
    .map((game, i): [string, OldGame] => [`long game, save ${String(i)}`, game]),
]

describe('storage cross-compatibility', () => {
  beforeEach(() => {
    globalThis.localStorage.clear()
  })

  it('shares the storage keys of today', () => {
    expect(STORAGE_KEYS).toEqual(OLD_KEYS)
  })

  it('covers every kind of state the corpus claims', () => {
    expect(generatedGame.length).toBeGreaterThan(20)
    expect(customGame.some((game) => game.solution !== null)).toBe(true)
    expect(longGame.at(-1)?.history.stack).toHaveLength(100)
    expect(corpus.some(([, game]) => game.history.index < game.history.stack.length - 1)).toBe(true)
  })

  it.each(corpus)('writes %s byte for byte as today', (_label, game) => {
    oldSaveGame(game)
    expect(writeGame(toGame(game))).toBe(globalThis.localStorage.getItem(OLD_KEYS.GAME))
    expect(writeGame(toGame(game))).toBe(JSON.stringify(oldEncodeGame(game)))
  })

  /** What the new codec must say about a save, given what the loader of today made of it. */
  const agreeWith = (old: OldGame | null, status: 'ok' | 'legacy') =>
    old === null ? { status: 'absent' } : { status, value: toGame(old) }

  it.each(corpus)('reads %s as today wrote it', (_label, game) => {
    oldSaveGame(game)
    const text = globalThis.localStorage.getItem(OLD_KEYS.GAME)
    const old = loadPersistedState().game
    expect(readGame(text)).toEqual(agreeWith(old, 'ok'))
    if (old !== null) expect(old).toEqual(game)
  })

  it.each(corpus)('hands %s back to the loader of today', (_label, game) => {
    const text = writeGame(toGame(game))
    globalThis.localStorage.setItem(STORAGE_KEYS.GAME, text)
    const old = loadPersistedState().game
    expect(readGame(text)).toEqual(agreeWith(old, 'ok'))
    if (old !== null) expect(old).toEqual(game)
  })

  it.each(corpus)('migrates %s from the legacy format as today does', (_label, game) => {
    const legacy = legacyJson(game)
    globalThis.localStorage.setItem(OLD_KEYS.GAME, legacy)
    const old = loadPersistedState().game
    const loaded = readGame(legacy)
    expect(loaded).toEqual(agreeWith(old, 'legacy'))
    if (loaded.status === 'legacy') {
      expect(writeGame(loaded.value)).toBe(globalThis.localStorage.getItem(OLD_KEYS.GAME))
    }
  })

  it('agrees with today on the untouched saves in the corpus', () => {
    const absent = corpus.filter(
      ([, game]) => readGame(writeGame(toGame(game))).status === 'absent',
    )
    expect(absent.map(([label]) => label)).toEqual(['custom game, step 0', 'custom game, step 1'])
  })

  describe('rejections', () => {
    let consoleErrorSpy: { mockRestore: () => void }

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      consoleErrorSpy.mockRestore()
    })

    it.each([
      ['not JSON', 'not json'],
      ['an unknown version', JSON.stringify({ ...oldEncodeGame(sampleGame()), version: 99 })],
      [
        'a corrupt board code',
        JSON.stringify({ ...oldEncodeGame(sampleGame()), initialBoard: 'x' }),
      ],
      [
        'a legacy board of the wrong length',
        JSON.stringify({ history: { stack: [[]], index: 0 } }),
      ],
      [
        'an index past the stack',
        JSON.stringify({ ...oldEncodeGame(sampleGame()), history: { stack: [], index: 0 } }),
      ],
    ])('refuses %s where today does', (_label, text) => {
      globalThis.localStorage.setItem(OLD_KEYS.GAME, text)
      expect(loadPersistedState().game).toBeNull()
      expect(readGame(text).status).toBe('corrupt')
    })

    it('ignores the untouched selection-screen save where today does', () => {
      const empty = {
        history: { stack: [emptyBoard()], index: 0 },
        initialBoard: emptyBoard(),
        solution: null,
        difficulty: null,
      }
      oldSaveGame(empty)
      const text = globalThis.localStorage.getItem(OLD_KEYS.GAME)
      expect(loadPersistedState().game).toBeNull()
      expect(readGame(text)).toEqual({ status: 'absent' })
    })
  })

  it('writes and reads metrics as today', () => {
    for (const metrics of [
      { timer: 0, mistakes: 0 },
      { timer: 754, mistakes: 3 },
    ]) {
      oldSaveMetrics(metrics)
      const text = globalThis.localStorage.getItem(OLD_KEYS.METRICS)
      expect(writeMetrics(metrics)).toBe(text)
      expect(readMetrics(text)).toEqual({ status: 'ok', value: metrics })
      expect(loadPersistedState().metrics).toEqual(metrics)
    }
  })

  it('writes and reads a refilled pool as today', () => {
    const puzzle = { puzzleString: PUZZLE, solutionString: SOLUTION }
    const state = sudokuReducer(initialState, {
      type: 'POOL_REFILL',
      puzzles: [
        { difficulty: 'hard', ...puzzle },
        { difficulty: 'easy', ...puzzle },
        { difficulty: 'hard', ...puzzle },
      ],
    })
    oldSavePool(state.puzzlePool)
    const text = globalThis.localStorage.getItem(OLD_KEYS.POOL)
    const pool: Pool = state.puzzlePool
    expect(writePool(pool)).toBe(text)
    expect(readPool(text)).toEqual({ status: 'ok', value: pool })
    globalThis.localStorage.setItem(OLD_KEYS.POOL, writePool(pool))
    expect(loadPersistedState().puzzlePool).toEqual(state.puzzlePool)
  })
})
