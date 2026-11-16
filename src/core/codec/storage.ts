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

import {
  type Board,
  boardFromCells,
  type Cell,
  cellAt,
  EMPTY_BOARD,
  isBoardString,
  parseBoard,
  valueAt,
} from '../board'
import { MS_PER_SECOND } from '../clock'
import { isDigit, isMask, maskOf, toDigit } from '../digits'
import { CELL_COUNT, CELLS } from '../geometry'
import { fromStack, type History, toStack } from '../history'
import { DIFFICULTIES, type Difficulty, isDifficulty, type Pool, type PuzzleData } from '../pool'

export const STORAGE_KEYS = {
  GAME: 'wasudoku.state.game',
  METRICS: 'wasudoku.state.metrics',
  POOL: 'wasudoku.state.pool',
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

export const GAME_FORMAT_VERSION = 2

/** A game session as the codec reads and writes it. */
export interface SavedGame {
  readonly history: History
  /** The board the game started from: the givens in play, empty while a puzzle is typed in. */
  readonly puzzle: Board
  /** Every cell's digit, or null when no solution is known. */
  readonly solution: Board | null
  readonly difficulty: Difficulty | null
}

/** The clock in whole seconds and the mistake count. */
export interface Metrics {
  readonly timer: number
  readonly mistakes: number
}

/** A game session as stored, five characters per cell. */
export interface PersistedGame {
  readonly version: typeof GAME_FORMAT_VERSION
  readonly history: { readonly stack: readonly string[]; readonly index: number }
  readonly initialBoard: string
  /** The 81 solution digits as one string, 0 where the solver left a gap. */
  readonly solution: string | null
  readonly difficulty: Difficulty | null
}

/** One storage key read back. A corrupt key costs only itself, and the reason is for the log. */
export type Loaded<T> =
  | { readonly status: 'absent' }
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'corrupt'; readonly reason: string }

/** A game from the format before version 2 also loads, and should be written back at once. */
export type LoadedGame =
  Loaded<SavedGame> | { readonly status: 'legacy'; readonly value: SavedGame }

const CELL_WIDTH = 5
const CANDIDATES_AT = 1
const CENTERS_AT = 3
const GIVEN_OFFSET = 10
// A cell is one state digit (value plus ten when given) and two base-32 digits per 9-bit mask.
const STATE_DIGITS = '0123456789abcdefghij'
const MASK_DIGITS = '0123456789abcdefghijklmnopqrstuv'
const MASK_DIGIT_BITS = 5
const LOW_DIGIT = (1 << MASK_DIGIT_BITS) - 1
const SOLUTION = /^\d{81}$/
const EMPTY_DIGIT = '0'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const fail = (reason: string): never => {
  throw new Error(reason)
}

const encodeMask = (mask: number): string =>
  `${MASK_DIGITS.charAt(mask >> MASK_DIGIT_BITS)}${MASK_DIGITS.charAt(mask & LOW_DIGIT)}`

const encodeCell = ({ value, given, candidates, centers }: Cell): string =>
  STATE_DIGITS.charAt((given ? GIVEN_OFFSET : 0) + (value ?? 0)) +
  encodeMask(candidates) +
  encodeMask(centers)

// Boards are immutable and shared across history entries, so each is encoded once.
const encodedBoards = new WeakMap<Board, string>()

export function encodeBoard(board: Board): string {
  let code = encodedBoards.get(board)
  if (code === undefined) {
    code = CELLS.map((index) => encodeCell(cellAt(board, index))).join('')
    encodedBoards.set(board, code)
  }
  return code
}

const EMPTY_BOARD_CODE = encodeBoard(EMPTY_BOARD)

function decodeMask(code: string, offset: number): number {
  const high = MASK_DIGITS.indexOf(code.charAt(offset))
  const low = MASK_DIGITS.indexOf(code.charAt(offset + 1))
  const mask = (high << MASK_DIGIT_BITS) | low
  return high < 0 || low < 0 || !isMask(mask) ? fail(`Bad mark mask at ${String(offset)}`) : mask
}

function decodeCell(code: string, offset: number): Cell {
  const state = STATE_DIGITS.indexOf(code.charAt(offset))
  if (state < 0) fail(`Bad cell state at ${String(offset)}`)
  return {
    value: toDigit(state % GIVEN_OFFSET),
    given: state >= GIVEN_OFFSET,
    candidates: decodeMask(code, offset + CANDIDATES_AT),
    centers: decodeMask(code, offset + CENTERS_AT),
  }
}

const toBoard = (cells: readonly Cell[]): Board => boardFromCells(cells) ?? fail('Bad board')

function readBoard(code: unknown): Board {
  if (typeof code !== 'string' || code.length !== CELL_COUNT * CELL_WIDTH) {
    return fail('Bad board code length')
  }
  return toBoard(CELLS.map((index) => decodeCell(code, index * CELL_WIDTH)))
}

/** Decodes one stored board, or null when the code is not one. */
export function decodeBoard(code: unknown): Board | null {
  try {
    return readBoard(code)
  } catch {
    return null
  }
}

const encodeSolution = (solution: Board): string =>
  CELLS.map((index) => valueAt(solution, index) ?? EMPTY_DIGIT).join('')

/** A solution string of 81 digits, where 0 leaves a cell empty. */
const solutionBoard = (digits: string): Board => parseBoard(digits) ?? fail('Bad solution')

export function encodeGame(game: SavedGame): PersistedGame {
  const { stack, index } = toStack(game.history)
  return {
    version: GAME_FORMAT_VERSION,
    history: { stack: stack.map(encodeBoard), index },
    initialBoard: encodeBoard(game.puzzle),
    solution: game.solution === null ? null : encodeSolution(game.solution),
    difficulty: game.difficulty,
  }
}

export const writeGame = (game: SavedGame): string => JSON.stringify(encodeGame(game))

function readHistory(raw: unknown, readEntry: (entry: unknown) => Board): History {
  if (!isRecord(raw) || !Array.isArray(raw['stack'])) return fail('Bad history')
  const stack: unknown[] = raw['stack']
  const index = raw['index']
  if (stack.length === 0 || typeof index !== 'number') return fail('Bad history')
  return fromStack(stack.map(readEntry), index) ?? fail('History index out of range')
}

// An unknown name loads as a custom game rather than costing the saved board.
function readDifficulty(difficulty: unknown): Difficulty | null {
  if (difficulty === undefined || difficulty === null) return null
  if (typeof difficulty !== 'string') return fail('Bad difficulty')
  return isDifficulty(difficulty) ? difficulty : null
}

function readCurrentGame(raw: Record<string, unknown>): SavedGame {
  if (raw['version'] !== GAME_FORMAT_VERSION) fail('Unknown game format')
  const { solution } = raw
  if (solution !== null && (typeof solution !== 'string' || !SOLUTION.test(solution))) {
    fail('Bad solution')
  }
  return {
    history: readHistory(raw['history'], readBoard),
    puzzle: readBoard(raw['initialBoard']),
    solution: typeof solution === 'string' ? solutionBoard(solution) : null,
    difficulty: readDifficulty(raw['difficulty']),
  }
}

// Builds before version 2 wrote every Set as {"__dataType":"Set","value":[...]}.
function readLegacyMarks(marks: unknown): number {
  if (!isRecord(marks) || marks['__dataType'] !== 'Set' || !Array.isArray(marks['value'])) {
    return fail('Bad legacy marks')
  }
  const digits: unknown[] = marks['value']
  return digits.every(isDigit) ? maskOf(digits) : fail('Bad legacy mark digit')
}

function readLegacyCell(cell: unknown): Cell {
  if (!isRecord(cell) || typeof cell['isGiven'] !== 'boolean') return fail('Bad legacy cell')
  const value = cell['value']
  if (value !== null && !isDigit(value)) return fail('Bad legacy value')
  return {
    value,
    given: cell['isGiven'],
    candidates: readLegacyMarks(cell['candidates']),
    centers: readLegacyMarks(cell['centers']),
  }
}

function readLegacyBoard(board: unknown): Board {
  if (!Array.isArray(board)) return fail('Bad legacy board')
  const cells: unknown[] = board
  return toBoard(cells.map(readLegacyCell))
}

const isSolutionDigit = (digit: unknown): boolean => digit === 0 || isDigit(digit)

function readLegacySolution(solution: unknown): Board | null {
  if (solution === undefined || solution === null) return null
  if (!Array.isArray(solution)) return fail('Bad legacy solution')
  const digits: unknown[] = solution
  return digits.every(isSolutionDigit)
    ? solutionBoard(digits.join(''))
    : fail('Bad legacy solution')
}

function readLegacyGame(raw: Record<string, unknown>): SavedGame {
  const history = readHistory(raw['history'], readLegacyBoard)
  const { initialBoard } = raw
  return {
    history,
    puzzle: initialBoard === undefined ? EMPTY_BOARD : readLegacyBoard(initialBoard),
    solution: readLegacySolution(raw['solution']),
    difficulty: readDifficulty(raw['difficulty']),
  }
}

// Earlier builds saved the untouched selection screen as one empty board, which is no game.
const isUntouchedEmptyGame = ({ history, puzzle }: SavedGame): boolean =>
  history.past.length === 0 &&
  history.future.length === 0 &&
  encodeBoard(history.present) === EMPTY_BOARD_CODE &&
  encodeBoard(puzzle) === EMPTY_BOARD_CODE

/** Parses a stored value. Empty text, like a missing key, is absent. */
function load<T>(text: string | null, decode: (raw: unknown) => T): Loaded<T> {
  if (text === null || text === '') return { status: 'absent' }
  try {
    const raw: unknown = JSON.parse(text)
    return { status: 'ok', value: decode(raw) }
  } catch (error) {
    return { status: 'corrupt', reason: String(error) }
  }
}

const readAnyGame = (raw: unknown): { game: SavedGame; legacy: boolean } => {
  if (!isRecord(raw)) return fail('Unknown game format')
  const legacy = raw['version'] === undefined
  return { game: legacy ? readLegacyGame(raw) : readCurrentGame(raw), legacy }
}

/** Reads the stored game, in the current or the legacy format. */
export function readGame(text: string | null): LoadedGame {
  const loaded = load(text, readAnyGame)
  if (loaded.status !== 'ok') return loaded
  const { game, legacy } = loaded.value
  if (isUntouchedEmptyGame(game)) return { status: 'absent' }
  return { status: legacy ? 'legacy' : 'ok', value: game }
}

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

/** The longest stored timer whose milliseconds still count exactly, so the clock stays finite. */
export const MAX_TIMER_SECONDS = Math.floor(Number.MAX_SAFE_INTEGER / MS_PER_SECOND)

const isTimer = (n: unknown): n is number => isCount(n) && n <= MAX_TIMER_SECONDS

function readMetricsValue(raw: unknown): Metrics {
  if (!isRecord(raw)) return fail('Bad metrics')
  const { timer, mistakes } = raw
  return isTimer(timer) && isCount(mistakes) ? { timer, mistakes } : fail('Bad metrics')
}

export const writeMetrics = ({ timer, mistakes }: Metrics): string =>
  JSON.stringify({ timer, mistakes })

export const readMetrics = (text: string | null): Loaded<Metrics> => load(text, readMetricsValue)

const isPuzzle = (entry: unknown): entry is PuzzleData =>
  isRecord(entry) &&
  typeof entry['puzzleString'] === 'string' &&
  typeof entry['solutionString'] === 'string' &&
  isBoardString(entry['puzzleString']) &&
  isBoardString(entry['solutionString'])

const readPuzzles = (list: unknown): readonly PuzzleData[] => {
  if (list === undefined) return []
  if (!Array.isArray(list)) return fail('Bad pool entry')
  const entries: unknown[] = list
  return entries.every(isPuzzle)
    ? entries.map(({ puzzleString, solutionString }) => ({ puzzleString, solutionString }))
    : fail('Bad pool entry')
}

// Keys outside DIFFICULTIES are dropped, and a missing one loads as an empty list.
function readPoolValue(raw: unknown): Pool {
  const pool = isRecord(raw) ? raw['puzzlePool'] : undefined
  if (!isRecord(pool)) return fail('Bad pool')
  return {
    easy: readPuzzles(pool['easy']),
    medium: readPuzzles(pool['medium']),
    hard: readPuzzles(pool['hard']),
    expert: readPuzzles(pool['expert']),
    extreme: readPuzzles(pool['extreme']),
  }
}

export const writePool = (pool: Pool): string =>
  JSON.stringify({
    puzzlePool: Object.fromEntries(
      DIFFICULTIES.map((difficulty) => [difficulty, pool[difficulty]]),
    ),
  })

export const readPool = (text: string | null): Loaded<Pool> => load(text, readPoolValue)
