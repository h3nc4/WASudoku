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

/** A puzzle with one solution that singles alone solve, so a hint always has a logical step. */
export const PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
export const SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179'

/** A puzzle with many solutions, since it has nothing but the clues 1 and 2. */
export const AMBIGUOUS = `12${'.'.repeat(79)}`

// Written out rather than imported from src, so a change to the storage format fails these journeys.
export const STORAGE_KEYS = {
  GAME: 'wasudoku.state.game',
  METRICS: 'wasudoku.state.metrics',
  POOL: 'wasudoku.state.pool',
} as const

const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert', 'extreme'] as const

export interface GameMetrics {
  readonly timer: number
  readonly mistakes: number
}

/** PUZZLE as a version 2 save holds it, one row a line, captured from the app's own save. */
const PUZZLE_CODE = [
  'f0000d00000000000000h000000000000000000000000',
  'g00000000000000b0000j0000f0000000000000000000',
  '00000j0000i000000000000000000000000g000000000',
  'i0000000000000000000g0000000000000000000d0000',
  'e00000000000000i000000000d00000000000000b0000',
  'h0000000000000000000c0000000000000000000g0000',
  '00000g000000000000000000000000c0000i000000000',
  '000000000000000e0000b0000j00000000000000f0000',
  '00000000000000000000i00000000000000h0000j0000',
].join('')

const CELL_CODE_WIDTH = 5

// A player digit without notes saves as that digit followed by two empty note masks.
const boardCode = (digits: string): string =>
  [...digits]
    .map((char, i) =>
      PUZZLE[i] !== '0' || char === '.' || char === '0'
        ? PUZZLE_CODE.slice(i * CELL_CODE_WIDTH, (i + 1) * CELL_CODE_WIDTH)
        : `${char}0000`,
    )
    .join('')

export interface SavedGameSpec {
  /** The board as played, as 81 digits or dots. Cells that differ from the puzzle are player entries. */
  readonly board?: string
}

/** The puzzle with every cell but the listed ones filled from the solution. */
export function solvedExcept(...blanks: number[]): string {
  const clue = blanks.find((i) => PUZZLE[i] !== '0')
  if (clue !== undefined) throw new Error(`Cell ${clue} is a clue and cannot be left blank`)
  return [...SOLUTION].map((digit, i) => (blanks.includes(i) ? '.' : digit)).join('')
}

/** An easy game saved in storage format version 2, one move past the puzzle. */
export function savedGame(spec: SavedGameSpec = {}): string {
  return JSON.stringify({
    version: 2,
    history: { stack: [PUZZLE_CODE, boardCode(spec.board ?? PUZZLE)], index: 1 },
    initialBoard: PUZZLE_CODE,
    solution: SOLUTION,
    difficulty: 'easy',
  })
}

/** Puzzles the app keeps per difficulty before it starts generating more. */
const MIN_POOL_SIZE = 3

/** A full pool of the fixed puzzle, which keeps the app from generating in the background. */
export const fullPool = (size = MIN_POOL_SIZE): string => {
  const entry = { puzzleString: PUZZLE, solutionString: SOLUTION }
  const entries = Array.from({ length: size }, () => entry)
  const puzzlePool = Object.fromEntries(DIFFICULTIES.map((d) => [d, entries]))
  return JSON.stringify({ puzzlePool })
}

// The legacy save's one entry, a 4 in R1C3, and its center notes 2 and 6 in R1C4.
export const LEGACY_ENTRY_CELL = 2
export const LEGACY_NOTE_CELL = 3

// An empty cell saves as five zeros: no digit, then two empty note masks
const EMPTY_BOARD_CODE = '00000'.repeat(81)

/** The empty board that earlier builds saved from the untouched selection screen. */
export function selectionScreenSave(): string {
  return JSON.stringify({
    version: 2,
    history: { stack: [EMPTY_BOARD_CODE], index: 0 },
    initialBoard: EMPTY_BOARD_CODE,
    solution: null,
    difficulty: null,
  })
}

/** Each Set saved as {"__dataType":"Set","value":[...]}, the format of builds before version 2. */
export function legacyGame(): string {
  const tagged = (digits: number[]) => ({ __dataType: 'Set', value: digits })
  const toCells = (digits: string, entries: Record<number, number> = {}) =>
    [...digits].map((char, i) => ({
      value: entries[i] ?? (char === '0' ? null : Number(char)),
      isGiven: char !== '0',
      candidates: tagged([]),
      centers: tagged(i === LEGACY_NOTE_CELL ? [2, 6] : []),
    }))
  const initialBoard = toCells(PUZZLE)
  return JSON.stringify({
    history: { stack: [initialBoard, toCells(PUZZLE, { [LEGACY_ENTRY_CELL]: 4 })], index: 1 },
    initialBoard,
    solution: [...SOLUTION].map(Number),
    difficulty: 'medium',
  })
}
