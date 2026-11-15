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

/** Generator difficulties in the order they are offered, as the solver names them. */
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert', 'extreme'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const isDifficulty = (value: unknown): value is Difficulty =>
  DIFFICULTIES.some((difficulty) => difficulty === value)

/** Puzzles kept ready per difficulty, so a new game rarely waits for the generator. */
export const MIN_POOL_SIZE = 3
/** Most puzzles kept per difficulty, so spares from raced generations cannot pile up. */
export const MAX_POOL_SIZE = 6

/** A generated puzzle and its solution, as 81-character puzzle strings. */
export interface PuzzleData {
  readonly puzzleString: string
  readonly solutionString: string
}

/** A generated puzzle tagged with the difficulty whose pool it joins. */
export interface PooledPuzzle extends PuzzleData {
  readonly difficulty: Difficulty
}

export type Pool = Readonly<Record<Difficulty, readonly PuzzleData[]>>

export const EMPTY_POOL: Pool = { easy: [], medium: [], hard: [], expert: [], extreme: [] }

/** Takes the oldest puzzle of a difficulty, or null when its pool is empty. */
export function take(
  pool: Pool,
  difficulty: Difficulty,
): { puzzle: PuzzleData; pool: Pool } | null {
  const [puzzle, ...rest] = pool[difficulty]
  return puzzle === undefined ? null : { puzzle, pool: { ...pool, [difficulty]: rest } }
}

/** Adds each puzzle to its difficulty and drops any past MAX_POOL_SIZE. Untouched lists keep their identity. */
export function add(pool: Pool, puzzles: readonly PooledPuzzle[]): Pool {
  const next = { ...pool }
  for (const { difficulty, puzzleString, solutionString } of puzzles) {
    if (next[difficulty].length < MAX_POOL_SIZE) {
      next[difficulty] = [...next[difficulty], { puzzleString, solutionString }]
    }
  }
  return next
}

/** Difficulties below MIN_POOL_SIZE, counting puzzles generated but not yet in the pool. */
export const shortDifficulties = (pool: Pool, pending: readonly PooledPuzzle[]): Difficulty[] =>
  DIFFICULTIES.filter(
    (difficulty) =>
      pool[difficulty].length + pending.filter((p) => p.difficulty === difficulty).length <
      MIN_POOL_SIZE,
  )
