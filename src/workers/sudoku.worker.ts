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

/* v8 ignore next */
import init, { generate_sudoku, solve_sudoku, validate_puzzle } from 'wasudoku-wasm'

import type {
  GeneratedPuzzle,
  Responses,
  TaskType,
  WorkerRequest,
  WorkerResponse,
} from '@/workers/protocol'

// Initialize the WASM module on worker startup.
const wasmReady = init()

function run(request: WorkerRequest): Responses[TaskType] {
  if (request.type === 'solve' && request.boardString) {
    return solve_sudoku(request.boardString) as Responses['solve']
  }
  if (request.type === 'generate' && request.difficulty) {
    const { puzzle, solution } = generate_sudoku(request.difficulty) as GeneratedPuzzle
    return { puzzleString: puzzle, solutionString: solution }
  }
  if (request.type === 'validate' && request.boardString) {
    const solution = validate_puzzle(request.boardString)
    return { isValid: solution !== undefined, solutionString: solution ?? '' }
  }
  throw new Error(`Unknown or malformed request type: ${String(request.type)}`)
}

/**
 * Handles incoming messages, runs the solver, and posts the result back.
 * The worker is stateless regarding request context; it simply correlates
 * the response with the request ID.
 * @param event The message event from the main thread.
 */
export async function handleMessage(event: MessageEvent<WorkerRequest>) {
  // Enforce same-origin policy for security.
  const isSameOrigin = self.location.origin === event.origin
  const isFileOrTestOrigin = event.origin === 'null' || event.origin === ''

  if (!isSameOrigin && !isFileOrTestOrigin) {
    console.error(`Message from untrusted origin '${event.origin}' ignored.`)
    return
  }

  const { id } = event.data
  let response: WorkerResponse

  try {
    await wasmReady
    response = { id, status: 'success', payload: run(event.data) }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    response = { id, status: 'error', error: errorMessage }
  }
  self.postMessage(response)
}

// Attach the handler to the 'message' event in the worker's global scope.
self.addEventListener('message', handleMessage)
