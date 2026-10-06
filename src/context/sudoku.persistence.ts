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
  type BoardState,
  type CellState,
  DIFFICULTIES,
  type Difficulty,
  type GameMetrics,
  type PersistedGame,
  type PersistedPool,
  type PuzzleData,
  type SavedGame,
} from './sudoku.types'

export const STORAGE_KEYS = {
  GAME: 'wasudoku.state.game',
  METRICS: 'wasudoku.state.metrics',
  POOL: 'wasudoku.state.pool',
} as const

export const GAME_FORMAT_VERSION = 2

const BOARD_SIZE = 81
const CELL_WIDTH = 5
const IDLE_TIMEOUT_MS = 1000
const FALLBACK_DELAY_MS = 200

// A cell is one state digit (value plus ten when given) and two base-32 digits per 9-bit mark mask.
const STATE_DIGITS = '0123456789abcdefghij'
const MASK_DIGITS = '0123456789abcdefghijklmnopqrstuv'
const MAX_MASK = 0b111111111

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isDigit = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 9

function toMask(marks: ReadonlySet<number>): number {
  let mask = 0
  marks.forEach((digit) => {
    mask |= 1 << (digit - 1)
  })
  return mask
}

function fromMask(mask: number): Set<number> {
  const marks = new Set<number>()
  for (let digit = 1; digit <= 9; digit++) {
    if (mask & (1 << (digit - 1))) marks.add(digit)
  }
  return marks
}

const encodeMask = (marks: ReadonlySet<number>): string => {
  const mask = toMask(marks)
  return MASK_DIGITS[mask >> 5] + MASK_DIGITS[mask & 31]
}

function decodeMask(code: string, offset: number): Set<number> {
  const high = MASK_DIGITS.indexOf(code[offset])
  const low = MASK_DIGITS.indexOf(code[offset + 1])
  const mask = (high << 5) | low
  if (high < 0 || low < 0 || mask > MAX_MASK) throw new Error(`Bad mark mask at ${offset}`)
  return fromMask(mask)
}

const encodeCell = (cell: CellState): string =>
  STATE_DIGITS[(cell.isGiven ? 10 : 0) + (cell.value ?? 0)] +
  encodeMask(cell.candidates) +
  encodeMask(cell.centers)

// Boards are immutable and shared across history entries, so each is encoded once.
const encodedBoards = new WeakMap<BoardState, string>()

export function encodeBoard(board: BoardState): string {
  let code = encodedBoards.get(board)
  if (code === undefined) {
    code = board.map(encodeCell).join('')
    encodedBoards.set(board, code)
  }
  return code
}

export function decodeBoard(code: unknown): BoardState {
  if (typeof code !== 'string' || code.length !== BOARD_SIZE * CELL_WIDTH) {
    throw new Error('Bad board code length')
  }
  return Array.from({ length: BOARD_SIZE }, (_, i) => {
    const offset = i * CELL_WIDTH
    const state = STATE_DIGITS.indexOf(code[offset])
    if (state < 0) throw new Error(`Bad cell state at ${offset}`)
    const value = state % 10
    return {
      value: value === 0 ? null : value,
      isGiven: state >= 10,
      candidates: decodeMask(code, offset + 1),
      centers: decodeMask(code, offset + 3),
    }
  })
}

const EMPTY_BOARD_CODE = '00000'.repeat(BOARD_SIZE)

function checkHistoryIndex(stack: readonly unknown[], index: unknown): number {
  if (stack.length === 0 || !Number.isInteger(index)) throw new Error('Bad history')
  const i = index as number
  if (i < 0 || i >= stack.length) throw new Error('History index out of range')
  return i
}

const isDifficulty = (value: unknown): value is Difficulty =>
  (DIFFICULTIES as readonly unknown[]).includes(value)

// An unknown name loads as a custom game rather than costing the saved board.
const checkDifficulty = (difficulty: unknown): Difficulty | null => {
  if (difficulty === undefined || difficulty === null) return null
  if (typeof difficulty !== 'string') throw new Error('Bad difficulty')
  return isDifficulty(difficulty) ? difficulty : null
}

export function encodeGame(game: SavedGame): PersistedGame {
  return {
    version: GAME_FORMAT_VERSION,
    history: { stack: game.history.stack.map(encodeBoard), index: game.history.index },
    initialBoard: encodeBoard(game.initialBoard),
    solution: game.solution ? game.solution.join('') : null,
    difficulty: game.difficulty,
  }
}

export function decodeGame(raw: unknown): SavedGame {
  if (!isRecord(raw) || raw.version !== GAME_FORMAT_VERSION) throw new Error('Unknown game format')
  const { history, initialBoard, solution } = raw
  if (!isRecord(history) || !Array.isArray(history.stack)) throw new Error('Bad history')
  const index = checkHistoryIndex(history.stack, history.index)
  if (solution !== null && (typeof solution !== 'string' || !/^\d{81}$/.test(solution))) {
    throw new Error('Bad solution')
  }
  return {
    history: { stack: history.stack.map(decodeBoard), index },
    initialBoard: decodeBoard(initialBoard),
    solution: solution === null ? null : [...solution].map(Number),
    difficulty: checkDifficulty(raw.difficulty),
  }
}

// Builds before version 2 wrote every Set as {"__dataType":"Set","value":[...]}.
function decodeLegacyMarks(marks: unknown): Set<number> {
  if (!isRecord(marks) || marks.__dataType !== 'Set' || !Array.isArray(marks.value)) {
    throw new Error('Bad legacy marks')
  }
  if (!marks.value.every(isDigit)) throw new Error('Bad legacy mark digit')
  return new Set(marks.value)
}

function decodeLegacyBoard(board: unknown): BoardState {
  if (!Array.isArray(board) || board.length !== BOARD_SIZE) throw new Error('Bad legacy board')
  return board.map((cell: unknown) => {
    if (!isRecord(cell) || typeof cell.isGiven !== 'boolean') throw new Error('Bad legacy cell')
    if (cell.value !== null && !isDigit(cell.value)) throw new Error('Bad legacy value')
    return {
      value: cell.value as number | null,
      isGiven: cell.isGiven,
      candidates: decodeLegacyMarks(cell.candidates),
      centers: decodeLegacyMarks(cell.centers),
    }
  })
}

function decodeLegacyGame(raw: Record<string, unknown>): SavedGame {
  const { history, initialBoard, solution } = raw
  if (!isRecord(history) || !Array.isArray(history.stack)) throw new Error('Bad history')
  const index = checkHistoryIndex(history.stack, history.index)
  const hasSolution = solution !== undefined && solution !== null
  if (
    hasSolution &&
    (!Array.isArray(solution) ||
      solution.length !== BOARD_SIZE ||
      !solution.every((d) => Number.isInteger(d) && d >= 0 && d <= 9))
  ) {
    throw new Error('Bad legacy solution')
  }
  return {
    history: { stack: history.stack.map(decodeLegacyBoard), index },
    initialBoard:
      initialBoard === undefined ? decodeBoard(EMPTY_BOARD_CODE) : decodeLegacyBoard(initialBoard),
    solution: hasSolution ? (solution as number[]) : null,
    difficulty: checkDifficulty(raw.difficulty),
  }
}

function decodeMetrics(raw: unknown): GameMetrics {
  const isCount = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0
  if (!isRecord(raw) || !isCount(raw.timer) || !isCount(raw.mistakes)) {
    throw new Error('Bad metrics')
  }
  return { timer: raw.timer as number, mistakes: raw.mistakes as number }
}

// Keys outside DIFFICULTIES are dropped, and a missing one loads as an empty list.
function decodePool(raw: unknown): Record<Difficulty, PuzzleData[]> {
  if (!isRecord(raw) || !isRecord(raw.puzzlePool)) throw new Error('Bad pool')
  const pool = raw.puzzlePool
  const isPuzzle = (p: unknown) =>
    isRecord(p) && typeof p.puzzleString === 'string' && typeof p.solutionString === 'string'
  const entries = DIFFICULTIES.map((difficulty) => {
    const list = pool[difficulty] === undefined ? [] : pool[difficulty]
    if (!Array.isArray(list) || !list.every(isPuzzle)) throw new Error('Bad pool entry')
    return [difficulty, list as PuzzleData[]] as const
  })
  return Object.fromEntries(entries) as Record<Difficulty, PuzzleData[]>
}

function write(key: string, data: unknown) {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(data))
  } catch (error) {
    console.error(`Failed to save ${key} to local storage:`, error)
  }
}

export const saveGame = (game: SavedGame) => write(STORAGE_KEYS.GAME, encodeGame(game))
export const saveMetrics = (metrics: GameMetrics) => write(STORAGE_KEYS.METRICS, metrics)
export const savePool = (puzzlePool: Record<Difficulty, PuzzleData[]>) =>
  write(STORAGE_KEYS.POOL, { puzzlePool } satisfies PersistedPool)

function load<T>(key: string, decode: (raw: unknown) => T): T | null {
  try {
    const item = globalThis.localStorage.getItem(key)
    return item ? decode(JSON.parse(item)) : null
  } catch (error) {
    console.error(`Failed to load ${key} from local storage:`, error)
    return null
  }
}

function decodeAnyGame(raw: unknown): SavedGame {
  if (isRecord(raw) && raw.version === undefined) {
    const game = decodeLegacyGame(raw)
    saveGame(game)
    return game
  }
  return decodeGame(raw)
}

export interface PersistedSnapshot {
  readonly game: SavedGame | null
  readonly metrics: GameMetrics | null
  readonly puzzlePool: Record<Difficulty, PuzzleData[]> | null
}

/** Reads every key on its own, so one corrupt entry never costs the others. */
export function loadPersistedState(): PersistedSnapshot {
  return {
    game: load(STORAGE_KEYS.GAME, decodeAnyGame),
    metrics: load(STORAGE_KEYS.METRICS, decodeMetrics),
    puzzlePool: load(STORAGE_KEYS.POOL, decodePool),
  }
}

/** Runs the callback when the browser is idle, or after a short delay without idle callbacks. */
export function scheduleIdle(callback: () => void): () => void {
  if (typeof globalThis.requestIdleCallback === 'function') {
    const id = globalThis.requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS })
    return () => globalThis.cancelIdleCallback(id)
  }
  const id = globalThis.setTimeout(callback, FALLBACK_DELAY_MS)
  return () => globalThis.clearTimeout(id)
}
