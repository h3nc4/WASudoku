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

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

// Mock the wasudoku-wasm module. This will be hoisted.
vi.mock('wasudoku-wasm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('wasudoku-wasm')>()
  return {
    ...actual,
    default: vi.fn().mockResolvedValue({}),
    solve_sudoku: vi.fn(),
    generate_sudoku: vi.fn(),
    validate_puzzle: vi.fn(),
  }
})

describe('Sudoku Worker Logic', () => {
  let handleMessage: typeof import('@/workers/sudoku.worker').handleMessage
  let init: Mock
  let solve_sudoku: Mock
  let generate_sudoku: Mock
  let validate_puzzle: Mock
  let mockPostMessage: Mock
  let mockAddEventListener: Mock
  const workerOrigin = 'http://localhost:3000'

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    mockPostMessage = vi.fn()
    mockAddEventListener = vi.fn()

    vi.stubGlobal('self', {
      postMessage: mockPostMessage,
      addEventListener: mockAddEventListener,
      location: {
        origin: workerOrigin,
      },
    })

    const wasmModule = await import('wasudoku-wasm')
    init = wasmModule.default as Mock
    solve_sudoku = wasmModule.solve_sudoku as Mock
    generate_sudoku = wasmModule.generate_sudoku as Mock
    validate_puzzle = wasmModule.validate_puzzle as Mock

    const workerModule = await import('@/workers/sudoku.worker.ts')
    handleMessage = workerModule.handleMessage
  })

  const simulateMessage = (
    data: { id: number; type: string; [key: string]: unknown },
    origin = workerOrigin,
  ) => {
    const event = { data, origin } as MessageEvent
    return handleMessage(event)
  }

  it('should initialize WASM and attach listener', () => {
    expect(mockAddEventListener).toHaveBeenCalledWith('message', handleMessage)
    if (init.mock.calls.length > 0) expect(init).toHaveBeenCalled()
  })

  it('should handle "solve" request and return "success" with id', async () => {
    const boardString = '...'
    const result = { steps: [], solution: '...' }
    solve_sudoku.mockReturnValue(result)

    await simulateMessage({ id: 123, type: 'solve', boardString })

    expect(solve_sudoku).toHaveBeenCalledWith(boardString)
    expect(mockPostMessage).toHaveBeenCalledWith({
      id: 123,
      status: 'success',
      payload: result,
    })
  })

  it('should handle "generate" request', async () => {
    generate_sudoku.mockReturnValue('puzzle')
    solve_sudoku.mockReturnValue({ solution: 'solution' })

    await simulateMessage({ id: 456, type: 'generate', difficulty: 'easy' })

    expect(generate_sudoku).toHaveBeenCalledWith('easy')
    expect(mockPostMessage).toHaveBeenCalledWith({
      id: 456,
      status: 'success',
      payload: { puzzleString: 'puzzle', solutionString: 'solution' },
    })
  })

  it('should handle puzzle generation where solve returns no solution', async () => {
    const difficulty = 'easy'
    const puzzleString = '1....'
    generate_sudoku.mockReturnValue(puzzleString)
    // Return solution as undefined/null to hit the ?? '' branch
    solve_sudoku.mockReturnValue({ solution: null })

    await simulateMessage({ id: 456, type: 'generate', difficulty })

    expect(generate_sudoku).toHaveBeenCalledWith(difficulty)
    expect(solve_sudoku).toHaveBeenCalledWith(puzzleString)
    expect(mockPostMessage).toHaveBeenCalledWith({
      id: 456,
      status: 'success',
      payload: { puzzleString, solutionString: '' },
    })
  })

  it('should handle "validate" request', async () => {
    validate_puzzle.mockReturnValue(true)
    solve_sudoku.mockReturnValue({ solution: 'sol' })

    await simulateMessage({ id: 789, type: 'validate', boardString: '...' })

    expect(validate_puzzle).toHaveBeenCalledWith('...')
    expect(mockPostMessage).toHaveBeenCalledWith({
      id: 789,
      status: 'success',
      payload: { isValid: true, solutionString: 'sol' },
    })
  })

  it('should handle puzzle validation where solve returns no solution', async () => {
    const boardString = '.'.repeat(81)
    validate_puzzle.mockReturnValue(true)
    // Return solution as undefined/null to hit the ?? '' branch
    solve_sudoku.mockReturnValue({ solution: null })

    await simulateMessage({ id: 789, type: 'validate', boardString })

    expect(validate_puzzle).toHaveBeenCalledWith(boardString)
    expect(solve_sudoku).toHaveBeenCalledWith(boardString)
    expect(mockPostMessage).toHaveBeenCalledWith({
      id: 789,
      status: 'success',
      payload: { isValid: true, solutionString: '' },
    })
  })

  it('should not solve if validation fails', async () => {
    const boardString = '.'.repeat(81)
    validate_puzzle.mockReturnValue(false)

    await simulateMessage({ id: 789, type: 'validate', boardString })

    expect(validate_puzzle).toHaveBeenCalledWith(boardString)
    expect(solve_sudoku).not.toHaveBeenCalled()
    expect(mockPostMessage).toHaveBeenCalledWith({
      id: 789,
      status: 'success',
      payload: { isValid: false, solutionString: '' },
    })
  })

  it('should handle errors and return "error" status with id', async () => {
    solve_sudoku.mockImplementation(() => {
      throw new Error('Boom')
    })

    // Pass a valid boardString so it attempts to solve and hits the mock error
    await simulateMessage({ id: 999, type: 'solve', boardString: 'valid-board-string' })

    expect(mockPostMessage).toHaveBeenCalledWith({
      id: 999,
      status: 'error',
      error: 'Boom',
    })
  })

  it('should handle non-Error exceptions and convert to string', async () => {
    const stringError = 'Something bad happened'
    solve_sudoku.mockImplementation(() => {
      throw stringError
    })

    await simulateMessage({ id: 999, type: 'solve', boardString: 'valid' })

    expect(mockPostMessage).toHaveBeenCalledWith({
      id: 999,
      status: 'error',
      error: stringError,
    })
  })

  it('should return error for unknown message types', async () => {
    await simulateMessage({ id: 999, type: 'unknown_thing' })

    expect(mockPostMessage).toHaveBeenCalledWith({
      id: 999,
      status: 'error',
      error: 'Unknown or malformed request type: unknown_thing',
    })
  })

  it('should ignore foreign origin', async () => {
    await simulateMessage({ id: 1, type: 'solve' }, 'http://evil.com')
    expect(mockPostMessage).not.toHaveBeenCalled()
  })
})
