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

import {
  decodeBoard,
  decodeGame,
  encodeBoard,
  encodeGame,
  GAME_FORMAT_VERSION,
  loadPersistedState,
  saveGame,
  scheduleIdle,
  STORAGE_KEYS,
} from './sudoku.persistence'
import type { BoardState, CellState, SavedGame } from './sudoku.types'

// Verbatim copy of the replacer that builds before version 2 saved the game with.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function legacyReplacer(_key: string, value: any) {
  if (value instanceof Set) {
    return {
      __dataType: 'Set',
      value: [...value],
    }
  }
  return value
}

const legacyJson = (game: SavedGame) =>
  JSON.stringify(
    {
      history: { stack: game.history.stack, index: game.history.index },
      initialBoard: game.initialBoard,
      solution: game.solution,
      difficulty: game.difficulty,
    },
    legacyReplacer,
  )

const cell = (over: Partial<CellState> = {}): CellState => ({
  value: null,
  isGiven: false,
  candidates: new Set<number>(),
  centers: new Set<number>(),
  ...over,
})

/** A mid-game board with givens, placed values, candidates and centers. */
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

const sampleGame = (size = 3): SavedGame => {
  const stack = Array.from({ length: size }, (_, i) => midGameBoard(i))
  return {
    history: { stack, index: size - 1 },
    initialBoard: stack[0],
    solution: Array.from({ length: 81 }, (_, i) => (i % 9) + 1),
    difficulty: 'hard',
  }
}

const legacyGameWith = (board: BoardState, solution: unknown = null) =>
  JSON.stringify({ history: { stack: [board], index: 0 }, solution }, legacyReplacer)

describe('board encoding', () => {
  it('round-trips values, givens, candidates and centers', () => {
    const board: BoardState = [
      cell({ value: 9, isGiven: true }),
      cell({ value: 4 }),
      cell({ candidates: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]) }),
      cell({ centers: new Set([2, 7]) }),
      cell({ candidates: new Set([1, 9]), centers: new Set([5]) }),
      cell({ isGiven: true }),
      ...emptyBoard().slice(6),
    ]
    const code = encodeBoard(board)
    expect(code).toHaveLength(81 * 5)
    expect(decodeBoard(code)).toEqual(board)
  })

  it('round-trips a mid-game board', () => {
    const board = midGameBoard(4)
    expect(decodeBoard(encodeBoard(board))).toEqual(board)
  })

  it('returns the cached code for a board it has already encoded', () => {
    const board = midGameBoard()
    expect(encodeBoard(board)).toBe(encodeBoard(board))
  })

  it.each([
    ['a short code', '00000'],
    ['a non-string', 42],
    ['an unknown state digit', 'z' + '0'.repeat(404)],
    ['an unknown mask digit', '0z' + '0'.repeat(403)],
    ['a mask above nine bits', '0g0' + '0'.repeat(402)],
  ])('rejects %s', (_label, code) => {
    expect(() => decodeBoard(code)).toThrow()
  })
})

describe('game encoding', () => {
  it('round-trips a game with history, solution and difficulty', () => {
    const game = sampleGame()
    const encoded = encodeGame(game)
    expect(encoded.version).toBe(GAME_FORMAT_VERSION)
    expect(encoded.solution).toBe(game.solution?.join(''))
    expect(decodeGame(JSON.parse(JSON.stringify(encoded)))).toEqual(game)
  })

  it('round-trips a game without solution or difficulty', () => {
    const game: SavedGame = { ...sampleGame(1), solution: null, difficulty: null }
    expect(decodeGame(encodeGame(game))).toEqual(game)
  })

  it('loads an unknown difficulty name as a custom game', () => {
    const raw = { ...encodeGame(sampleGame()), difficulty: 'nightmare' }
    expect(decodeGame(raw)).toEqual({ ...sampleGame(), difficulty: null })
  })

  it.each([
    ['an unknown version', { ...encodeGame(sampleGame()), version: 3 }],
    ['an index past the stack', { ...encodeGame(sampleGame()), history: { stack: [], index: 0 } }],
    [
      'an index outside a full stack',
      { ...encodeGame(sampleGame()), history: { ...encodeGame(sampleGame()).history, index: 3 } },
    ],
    ['a history without a stack', { ...encodeGame(sampleGame()), history: null }],
    ['a bad solution', { ...encodeGame(sampleGame()), solution: '12' }],
    ['a bad difficulty', { ...encodeGame(sampleGame()), difficulty: 7 }],
    ['a non-object', 'game'],
  ])('rejects %s', (_label, raw) => {
    expect(() => decodeGame(raw)).toThrow()
  })

  it('keeps a full history at a small fraction of the legacy size', () => {
    const game = sampleGame(100)
    const legacy = legacyJson(game).length
    const compact = JSON.stringify(encodeGame(game)).length
    expect(compact).toBeLessThan(legacy / 15)
  })
})

describe('loadPersistedState', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    globalThis.localStorage.clear()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('returns nothing from empty storage', () => {
    expect(loadPersistedState()).toEqual({ game: null, metrics: null, puzzlePool: null })
  })

  it('loads a game in the current format', () => {
    const game = sampleGame()
    saveGame(game)
    expect(loadPersistedState().game).toEqual(game)
  })

  it('loads a legacy game and rewrites it in the current format once', () => {
    const game = sampleGame()
    globalThis.localStorage.setItem(STORAGE_KEYS.GAME, legacyJson(game))

    expect(loadPersistedState().game).toEqual(game)
    const stored = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEYS.GAME) ?? '')
    expect(stored.version).toBe(GAME_FORMAT_VERSION)

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    expect(loadPersistedState().game).toEqual(game)
    expect(setItemSpy).not.toHaveBeenCalled()
    setItemSpy.mockRestore()
  })

  it('defaults a missing legacy initial board and solution', () => {
    const board = midGameBoard()
    globalThis.localStorage.setItem(
      STORAGE_KEYS.GAME,
      JSON.stringify({ history: { stack: [board], index: 0 } }, legacyReplacer),
    )
    const { game } = loadPersistedState()
    expect(game?.initialBoard).toEqual(emptyBoard())
    expect(game?.solution).toBeNull()
    expect(game?.difficulty).toBeNull()
  })

  it.each([
    ['not JSON', 'not json'],
    ['an unknown version', JSON.stringify({ ...encodeGame(sampleGame()), version: 99 })],
    ['a legacy game without a stack', JSON.stringify({ history: { index: 0 } })],
    [
      'a legacy cell with an untagged Set',
      JSON.stringify({ history: { stack: [emptyBoard()], index: 0 } }),
    ],
    ['a corrupt board code', JSON.stringify({ ...encodeGame(sampleGame()), initialBoard: 'x' })],
    ['a legacy board of the wrong length', legacyGameWith([cell()])],
    [
      'a legacy board of null cells',
      JSON.stringify({ history: { stack: [Array.from({ length: 81 }, () => null)], index: 0 } }),
    ],
    ['a legacy solution of the wrong length', legacyGameWith(emptyBoard(), [1, 2, 3])],
    [
      'a legacy cell value out of range',
      legacyGameWith([cell({ value: 12 }), ...emptyBoard().slice(1)]),
    ],
    [
      'a legacy mark out of range',
      legacyGameWith([cell({ candidates: new Set([0]) }), ...emptyBoard().slice(1)]),
    ],
  ])('falls back to a fresh game on %s and keeps the other keys', (_label, json) => {
    globalThis.localStorage.setItem(STORAGE_KEYS.GAME, json)
    globalThis.localStorage.setItem(STORAGE_KEYS.METRICS, JSON.stringify({ timer: 5, mistakes: 1 }))

    const state = loadPersistedState()
    expect(state.game).toBeNull()
    expect(state.metrics).toEqual({ timer: 5, mistakes: 1 })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Failed to load ${STORAGE_KEYS.GAME} from local storage:`,
      expect.any(Error),
    )
  })

  it('rejects a pool without its puzzle map', () => {
    globalThis.localStorage.setItem(STORAGE_KEYS.POOL, JSON.stringify({ puzzlePool: null }))
    expect(loadPersistedState().puzzlePool).toBeNull()
  })

  it('rejects malformed metrics and pool', () => {
    globalThis.localStorage.setItem(STORAGE_KEYS.METRICS, JSON.stringify({ timer: 'x' }))
    globalThis.localStorage.setItem(
      STORAGE_KEYS.POOL,
      JSON.stringify({ puzzlePool: { easy: [{ puzzleString: 1 }] } }),
    )
    expect(loadPersistedState()).toEqual({ game: null, metrics: null, puzzlePool: null })
  })

  it('loads the pool and ignores a persisted request count', () => {
    const puzzlePool = { easy: [{ puzzleString: 'abc', solutionString: 'def' }] }
    globalThis.localStorage.setItem(
      STORAGE_KEYS.POOL,
      JSON.stringify({ puzzlePool, poolRequestCount: { easy: 3 } }),
    )
    expect(loadPersistedState().puzzlePool).toEqual({
      ...puzzlePool,
      medium: [],
      hard: [],
      expert: [],
      extreme: [],
    })
  })

  it('drops pool keys that name no difficulty', () => {
    const hard = [{ puzzleString: 'abc', solutionString: 'def' }]
    globalThis.localStorage.setItem(
      STORAGE_KEYS.POOL,
      JSON.stringify({ puzzlePool: { hard, Hard: hard, nightmare: [{ puzzleString: 1 }] } }),
    )
    expect(loadPersistedState().puzzlePool).toEqual({
      easy: [],
      medium: [],
      hard,
      expert: [],
      extreme: [],
    })
  })

  it('survives storage that throws on read', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(loadPersistedState()).toEqual({ game: null, metrics: null, puzzlePool: null })
    getItemSpy.mockRestore()
  })
})

describe('scheduleIdle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('uses requestIdleCallback with a timeout when the browser has it', () => {
    const request = vi.fn(() => 7)
    const cancel = vi.fn()
    vi.stubGlobal('requestIdleCallback', request)
    vi.stubGlobal('cancelIdleCallback', cancel)
    const callback = vi.fn()

    scheduleIdle(callback)()

    expect(request).toHaveBeenCalledWith(callback, { timeout: expect.any(Number) })
    expect(cancel).toHaveBeenCalledWith(7)
  })

  it('falls back to a timer without requestIdleCallback', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', undefined)
    const callback = vi.fn()

    scheduleIdle(callback)
    expect(callback).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(callback).toHaveBeenCalledOnce()

    const cancelled = vi.fn()
    scheduleIdle(cancelled)()
    vi.runAllTimers()
    expect(cancelled).not.toHaveBeenCalled()
  })
})
