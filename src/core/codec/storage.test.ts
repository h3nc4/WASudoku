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

import { type Board, boardFromCells, type Cell, cellAt, EMPTY_BOARD, parseBoard } from '../board'
import { type Digit, digitsOf, FULL_MASK, maskOf } from '../digits'
import { CELLS } from '../geometry'
import { fromStack, type History, startHistory } from '../history'
import { EMPTY_POOL } from '../pool'
import {
  decodeBoard,
  encodeBoard,
  encodeGame,
  GAME_FORMAT_VERSION,
  readGame,
  readMetrics,
  readPool,
  type SavedGame,
  writeGame,
  writeMetrics,
  writePool,
} from './storage'

const EMPTY_CELL: Cell = { value: null, given: false, candidates: 0, centers: 0 }
const board = (cells: readonly Cell[]): Board => boardFromCells(cells) as Board
const digit = (n: number) => n as Digit

/** A mid-game board with givens, placed values, candidates and centers. */
const midGameBoard = (shift = 0): Board =>
  board(
    CELLS.map((i) => {
      const d = digit(((i + shift) % 9) + 1)
      if (i % 3 === 0) return { ...EMPTY_CELL, value: d, given: true }
      if (i % 7 === 0) return { ...EMPTY_CELL, value: d }
      if (i % 5 === 0) return { ...EMPTY_CELL, centers: maskOf([d, digit((d % 9) + 1)]) }
      return { ...EMPTY_CELL, candidates: maskOf([1, 3, 5, d]) }
    }),
  )

const SOLUTION = parseBoard('123456789'.repeat(9)) as Board

const historyOf = (stack: Board[], index = stack.length - 1) => fromStack(stack, index) as History

const sampleGame = (size = 3): SavedGame => {
  const stack = Array.from({ length: size }, (_, i) => midGameBoard(i))
  return {
    history: historyOf(stack),
    puzzle: midGameBoard(0),
    solution: SOLUTION,
    difficulty: 'hard',
  }
}

/** The old in-memory cell, which builds before version 2 wrote with a Set replacer. */
const legacyCell = (b: Board, i: (typeof CELLS)[number]) => {
  const { value, given, candidates, centers } = cellAt(b, i)
  return {
    value,
    isGiven: given,
    candidates: { __dataType: 'Set', value: digitsOf(candidates) },
    centers: { __dataType: 'Set', value: digitsOf(centers) },
  }
}
const legacyBoard = (b: Board) => CELLS.map((i) => legacyCell(b, i))

const legacyJson = (game: SavedGame, stack: Board[]) =>
  JSON.stringify({
    history: { stack: stack.map(legacyBoard), index: stack.length - 1 },
    initialBoard: legacyBoard(game.puzzle),
    solution: game.solution && CELLS.map((i) => cellAt(game.solution as Board, i).value ?? 0),
    difficulty: game.difficulty,
  })

const legacyGameWith = (cells: unknown[], solution: unknown = null) =>
  JSON.stringify({ history: { stack: [cells], index: 0 }, solution })

const okGame = (text: string) => {
  const loaded = readGame(text)
  return loaded.status === 'ok' || loaded.status === 'legacy' ? loaded.value : loaded
}

describe('board encoding', () => {
  it('round-trips values, givens, candidates and centers', () => {
    const cells: Cell[] = [
      { ...EMPTY_CELL, value: 9, given: true },
      { ...EMPTY_CELL, value: 4 },
      { ...EMPTY_CELL, candidates: FULL_MASK },
      { ...EMPTY_CELL, centers: maskOf([2, 7]) },
      { ...EMPTY_CELL, candidates: maskOf([1, 9]), centers: maskOf([5]) },
      { ...EMPTY_CELL, given: true },
      ...Array.from({ length: 75 }, () => EMPTY_CELL),
    ]
    const code = encodeBoard(board(cells))
    expect(code).toHaveLength(81 * 5)
    expect(code.slice(0, 30)).toBe('j0000' + '40000' + '0fv00' + '00022' + '0810g' + 'a0000')
    expect(decodeBoard(code)).toEqual(board(cells))
  })

  it('round-trips a mid-game board', () => {
    expect(decodeBoard(encodeBoard(midGameBoard(4)))).toEqual(midGameBoard(4))
  })

  it('returns the cached code for a board it has already encoded', () => {
    const b = midGameBoard()
    expect(encodeBoard(b)).toBe(encodeBoard(b))
  })

  it.each([
    ['a short code', '00000'],
    ['a non-string', 42],
    ['an unknown state digit', 'z' + '0'.repeat(404)],
    ['an unknown mask digit', '0z' + '0'.repeat(403)],
    ['a mask above nine bits', '0g0' + '0'.repeat(402)],
  ])('rejects %s', (_label, code) => {
    expect(decodeBoard(code)).toBeNull()
  })
})

describe('game encoding', () => {
  it('round-trips a game with history, solution and difficulty', () => {
    const game = sampleGame()
    const encoded = encodeGame(game)
    expect(encoded.version).toBe(GAME_FORMAT_VERSION)
    expect(encoded.solution).toBe('123456789'.repeat(9))
    expect(readGame(JSON.stringify(encoded))).toEqual({ status: 'ok', value: game })
  })

  it('round-trips a game without solution or difficulty', () => {
    const game: SavedGame = { ...sampleGame(1), solution: null, difficulty: null }
    expect(okGame(writeGame(game))).toEqual(game)
  })

  it('round-trips a history whose present is not its newest board', () => {
    const stack = [midGameBoard(0), midGameBoard(1), midGameBoard(2)]
    const game: SavedGame = { ...sampleGame(), history: historyOf(stack, 1) }
    expect(okGame(writeGame(game))).toEqual(game)
  })

  it('writes a solution gap as 0 and reads it back', () => {
    const gapped = parseBoard('1' + '.'.repeat(80)) as Board
    const text = writeGame({ ...sampleGame(), solution: gapped })
    expect(text).toContain(`"solution":"1${'0'.repeat(80)}"`)
    expect(okGame(text)).toEqual({ ...sampleGame(), solution: gapped })
  })

  it('writes the keys in the order of today', () => {
    expect(Object.keys(JSON.parse(writeGame(sampleGame())) as object)).toEqual([
      'version',
      'history',
      'initialBoard',
      'solution',
      'difficulty',
    ])
  })

  it('loads an unknown difficulty name as a custom game', () => {
    const raw = { ...encodeGame(sampleGame()), difficulty: 'nightmare' }
    expect(okGame(JSON.stringify(raw))).toEqual({ ...sampleGame(), difficulty: null })
  })

  it.each([
    ['an unknown version', { ...encodeGame(sampleGame()), version: 3 }],
    ['an index past the stack', { ...encodeGame(sampleGame()), history: { stack: [], index: 0 } }],
    [
      'an index outside a full stack',
      { ...encodeGame(sampleGame()), history: { ...encodeGame(sampleGame()).history, index: 3 } },
    ],
    [
      'an index that is not a number',
      { ...encodeGame(sampleGame()), history: { ...encodeGame(sampleGame()).history, index: '1' } },
    ],
    ['a history without a stack', { ...encodeGame(sampleGame()), history: null }],
    ['a bad solution', { ...encodeGame(sampleGame()), solution: '12' }],
    ['a solution that is not a string', { ...encodeGame(sampleGame()), solution: 12 }],
    ['a bad difficulty', { ...encodeGame(sampleGame()), difficulty: 7 }],
    ['a non-object', 'game'],
  ])('rejects %s', (_label, raw) => {
    expect(readGame(JSON.stringify(raw)).status).toBe('corrupt')
  })

  it('keeps a full history at a small fraction of the legacy size', () => {
    const game = sampleGame(100)
    const stack = Array.from({ length: 100 }, (_, i) => midGameBoard(i))
    expect(writeGame(game).length).toBeLessThan(legacyJson(game, stack).length / 15)
  })
})

describe('readGame', () => {
  it('returns nothing from a missing or empty key', () => {
    expect(readGame(null)).toEqual({ status: 'absent' })
    expect(readGame('')).toEqual({ status: 'absent' })
  })

  it('ignores the untouched empty game that earlier builds saved from the selection screen', () => {
    const empty: SavedGame = {
      history: startHistory(EMPTY_BOARD),
      puzzle: EMPTY_BOARD,
      solution: null,
      difficulty: null,
    }
    expect(readGame(writeGame(empty))).toEqual({ status: 'absent' })
    expect(readGame(legacyGameWith(legacyBoard(EMPTY_BOARD)))).toEqual({ status: 'absent' })
  })

  it('keeps an empty board that has a history or a puzzle behind it', () => {
    const edited: SavedGame = {
      history: historyOf([EMPTY_BOARD, EMPTY_BOARD]),
      puzzle: EMPTY_BOARD,
      solution: null,
      difficulty: null,
    }
    expect(okGame(writeGame(edited))).toEqual(edited)

    const undone = { ...edited, history: historyOf([EMPTY_BOARD, EMPTY_BOARD], 0) }
    expect(okGame(writeGame(undone))).toEqual(undone)

    const cleared = { ...edited, history: startHistory(EMPTY_BOARD), puzzle: midGameBoard() }
    expect(okGame(writeGame(cleared))).toEqual(cleared)

    const oneMove = sampleGame(1)
    expect(okGame(writeGame(oneMove))).toEqual(oneMove)
  })

  it('loads a legacy game and asks for it to be written back in the current format', () => {
    const game = sampleGame()
    const stack = [midGameBoard(0), midGameBoard(1), midGameBoard(2)]
    expect(readGame(legacyJson(game, stack))).toEqual({ status: 'legacy', value: game })
    expect(readGame(writeGame(game))).toEqual({ status: 'ok', value: game })
  })

  it('defaults a missing legacy initial board and solution', () => {
    const text = JSON.stringify({ history: { stack: [legacyBoard(midGameBoard())], index: 0 } })
    expect(okGame(text)).toEqual({
      history: startHistory(midGameBoard()),
      puzzle: EMPTY_BOARD,
      solution: null,
      difficulty: null,
    })
  })

  const emptyCells = () => legacyBoard(EMPTY_BOARD)

  it.each([
    ['not JSON', 'not json'],
    ['an unknown version', JSON.stringify({ ...encodeGame(sampleGame()), version: 99 })],
    ['a legacy game without a stack', JSON.stringify({ history: { index: 0 } })],
    [
      'a legacy cell with an untagged Set',
      JSON.stringify({
        history: { stack: [emptyCells().map((c) => ({ ...c, candidates: {} }))], index: 0 },
      }),
    ],
    ['a corrupt board code', JSON.stringify({ ...encodeGame(sampleGame()), initialBoard: 'x' })],
    ['a legacy board of the wrong length', legacyGameWith(emptyCells().slice(1))],
    ['a legacy board of null cells', legacyGameWith(CELLS.map(() => null))],
    ['a legacy solution of the wrong length', legacyGameWith(emptyCells(), [1, 2, 3])],
    [
      'a legacy solution of the wrong digits',
      legacyGameWith(
        emptyCells(),
        CELLS.map(() => 10),
      ),
    ],
    [
      'a legacy cell value out of range',
      legacyGameWith([{ ...emptyCells()[0], value: 12 }, ...emptyCells().slice(1)]),
    ],
    [
      'a legacy mark out of range',
      legacyGameWith([
        { ...emptyCells()[0], candidates: { __dataType: 'Set', value: [0] } },
        ...emptyCells().slice(1),
      ]),
    ],
    ['a top-level array', JSON.stringify([])],
    ['a legacy board that is not a list', JSON.stringify({ history: { stack: ['x'], index: 0 } })],
    ['a legacy solution that is not a list', legacyGameWith(emptyCells(), '5'.repeat(81))],
  ])('reports %s as corrupt', (_label, text) => {
    const loaded = readGame(text)
    expect(loaded.status).toBe('corrupt')
    expect(loaded.status === 'corrupt' && loaded.reason.length > 0).toBe(true)
  })

  it('reads a legacy solution with gaps', () => {
    const solution = CELLS.map((i) => (i === 0 ? 5 : 0))
    const game = okGame(legacyGameWith(legacyBoard(midGameBoard()), solution))
    expect(game).toMatchObject({ solution: parseBoard('5' + '.'.repeat(80)) })
  })
})

describe('metrics', () => {
  it('round-trips the clock and the mistakes', () => {
    expect(writeMetrics({ timer: 5, mistakes: 1 })).toBe('{"timer":5,"mistakes":1}')
    expect(readMetrics('{"timer":5,"mistakes":1}')).toEqual({
      status: 'ok',
      value: { timer: 5, mistakes: 1 },
    })
  })

  it.each(['{"timer":"x"}', '{"timer":-1,"mistakes":0}', '{"timer":1,"mistakes":null}', '[]', '7'])(
    'rejects malformed metrics %s',
    (text) => {
      expect(readMetrics(text).status).toBe('corrupt')
    },
  )

  it('returns nothing from a missing key', () => {
    expect(readMetrics(null)).toEqual({ status: 'absent' })
  })
})

describe('pool', () => {
  const entry = { puzzleString: '1'.repeat(81), solutionString: '2'.repeat(81) }

  it('rejects a pool without its puzzle map', () => {
    expect(readPool(JSON.stringify({ puzzlePool: null })).status).toBe('corrupt')
    expect(readPool('7').status).toBe('corrupt')
  })

  it.each([
    ['an entry that is not a puzzle', { easy: [{ puzzleString: 1 }] }],
    ['a list that is not a list', { easy: 'abc' }],
    ['a puzzle of the wrong length', { easy: [{ puzzleString: 'abc', solutionString: 'def' }] }],
    ['a solution of the wrong length', { easy: [{ ...entry, solutionString: '2' }] }],
  ])('rejects %s', (_label, puzzlePool) => {
    expect(readPool(JSON.stringify({ puzzlePool })).status).toBe('corrupt')
  })

  it('loads the pool and ignores a persisted request count', () => {
    const text = JSON.stringify({ puzzlePool: { easy: [entry] }, poolRequestCount: { easy: 3 } })
    expect(readPool(text)).toEqual({ status: 'ok', value: { ...EMPTY_POOL, easy: [entry] } })
  })

  it('drops pool keys that name no difficulty', () => {
    const hard = [entry]
    const text = JSON.stringify({
      puzzlePool: { hard, Hard: hard, nightmare: [{ puzzleString: 1 }] },
    })
    expect(readPool(text)).toEqual({ status: 'ok', value: { ...EMPTY_POOL, hard } })
  })

  it('drops fields a puzzle entry does not have', () => {
    const text = JSON.stringify({ puzzlePool: { easy: [{ ...entry, difficulty: 'easy' }] } })
    expect(readPool(text)).toEqual({ status: 'ok', value: { ...EMPTY_POOL, easy: [entry] } })
  })

  it('writes every difficulty in order and reads it back', () => {
    const pool = { ...EMPTY_POOL, extreme: [entry], easy: [entry, entry] }
    const text = writePool(pool)
    expect(Object.keys((JSON.parse(text) as { puzzlePool: object }).puzzlePool)).toEqual([
      'easy',
      'medium',
      'hard',
      'expert',
      'extreme',
    ])
    expect(readPool(text)).toEqual({ status: 'ok', value: pool })
  })

  it('returns nothing from a missing key', () => {
    expect(readPool(null)).toEqual({ status: 'absent' })
  })
})
