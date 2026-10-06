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

import type { Difficulty, SolveResult } from '@/context/sudoku.types'

/** Payload each task type sends to the worker. */
export interface Requests {
  solve: { boardString: string }
  generate: { difficulty: Difficulty }
  validate: { boardString: string }
}

/** Payload each task type resolves with. */
export interface Responses {
  solve: SolveResult
  generate: { puzzleString: string; solutionString: string }
  validate: { isValid: boolean; solutionString: string }
}

export type TaskType = keyof Requests

/** Message posted to the worker, its payload spread beside the id and type. */
export type WorkerRequest = { [K in TaskType]: { id: number; type: K } & Requests[K] }[TaskType]

/** Message posted back by the worker. */
export type WorkerResponse =
  | { id: number; status: 'success'; payload: Responses[TaskType] }
  | { id: number; status: 'error'; error: string }

/** Shape of `generate_sudoku`'s return value. */
export interface GeneratedPuzzle {
  puzzle: string
  solution: string
}
