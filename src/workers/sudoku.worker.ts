/*
 * Copyright (C) 2025  Henrique Almeida
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

// Initialize the WASM module on worker startup.
const wasmReady = init()

interface WorkerRequest {
  id: number
  type: 'solve' | 'generate' | 'validate'
  boardString?: string
  difficulty?: string
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

  const { id, type, boardString, difficulty } = event.data

  try {
    await wasmReady
    let payload: unknown

    if (type === 'solve' && boardString) {
      payload = solve_sudoku(boardString)
    } else if (type === 'generate' && difficulty) {
      const puzzleString = generate_sudoku(difficulty)
      const solveResult = solve_sudoku(puzzleString)
      const solutionString = solveResult.solution ?? ''
      payload = { puzzleString, solutionString }
    } else if (type === 'validate' && boardString) {
      const isValid = validate_puzzle(boardString)
      let solutionString = ''
      if (isValid) {
        const solveResult = solve_sudoku(boardString)
        solutionString = solveResult.solution ?? ''
      }
      payload = { isValid, solutionString }
    } else {
      throw new Error(`Unknown or malformed request type: ${type}`)
    }

    self.postMessage({ id, status: 'success', payload })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    self.postMessage({ id, status: 'error', error: errorMessage })
  }
}

// Attach the handler to the 'message' event in the worker's global scope.
self.addEventListener('message', handleMessage)
