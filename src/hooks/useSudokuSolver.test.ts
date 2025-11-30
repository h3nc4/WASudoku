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

import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { toast } from 'sonner'
import { useSudokuSolver } from './useSudokuSolver'
import SolverWorker from '@/workers/sudoku.worker?worker'
import type { SudokuState, SolveResult } from '@/context/sudoku.types'
import { initialState } from '@/context/sudoku.reducer'

type WorkerMessageData =
  | { type: 'solution'; result: SolveResult }
  | {
      type: 'puzzle_generated'
      puzzleString: string
      solutionString: string
      source?: 'user' | 'pool'
      difficulty?: string
    }
  | { type: 'validation_result'; isValid: boolean; solutionString: string }
  | { type: 'error'; error: string }

let messageHandler: (event: { data: WorkerMessageData }) => void
const mockWorkerInstance = {
  postMessage: vi.fn(),
  addEventListener: vi.fn((_event: string, handler) => {
    messageHandler = handler
  }),
  removeEventListener: vi.fn(),
  terminate: vi.fn(),
  dispatchEvent: vi.fn(),
  onerror: null,
  onmessage: null,
  onmessageerror: null,
  __simulateMessage(data: WorkerMessageData) {
    if (messageHandler) {
      messageHandler({ data })
    }
  },
}

vi.mock('@/workers/sudoku.worker?worker', () => ({
  default: vi.fn(function () {
    return mockWorkerInstance
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('useSudokuSolver', () => {
  const mockDispatch = vi.fn()

  // State with a full pool to prevent background refill actions from polluting tests
  const fullPoolState: SudokuState = {
    ...initialState,
    puzzlePool: {
      easy: Array(3).fill({ puzzleString: '', solutionString: '' }),
      medium: Array(3).fill({ puzzleString: '', solutionString: '' }),
      hard: Array(3).fill({ puzzleString: '', solutionString: '' }),
      extreme: Array(3).fill({ puzzleString: '', solutionString: '' }),
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(SolverWorker)
      .mockClear()
      .mockImplementation(function () {
        return mockWorkerInstance as unknown as Worker
      })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize and terminate the worker on mount/unmount', () => {
    const { unmount } = renderHook(() => useSudokuSolver(fullPoolState, mockDispatch))
    expect(SolverWorker).toHaveBeenCalledOnce()
    expect(mockWorkerInstance.addEventListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function),
    )

    unmount()
    expect(mockWorkerInstance.terminate).toHaveBeenCalledOnce()
  })

  it('should trigger pool refill when pool size is low', () => {
    // Initial state has 0 puzzles in pool, so it should trigger refill
    const { rerender } = renderHook((props) => useSudokuSolver(props.state, props.dispatch), {
      initialProps: { state: initialState, dispatch: mockDispatch },
    })

    // Expect requests for all 4 difficulties
    expect(mockDispatch).toHaveBeenCalledTimes(4)
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'REQUEST_POOL_REFILL',
      difficulty: 'easy',
    })
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(4)
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
      type: 'generate',
      difficulty: 'easy',
      source: 'pool',
    })

    // Simulate state update where one difficulty has pending request (count=1)
    const stateWithPending = {
      ...initialState,
      poolRequestCount: { ...initialState.poolRequestCount, easy: 1 },
    }
    mockDispatch.mockClear()
    mockWorkerInstance.postMessage.mockClear()

    rerender({ state: stateWithPending, dispatch: mockDispatch })

    // Since pending=1 and pool=0, total=1 < 3, so it should request again
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'REQUEST_POOL_REFILL',
      difficulty: 'easy',
    })
  })

  it('should handle missing difficulty keys in puzzlePool gracefully', () => {
    const incompletePoolState: SudokuState = {
      ...initialState,
      puzzlePool: {}, // Empty object, missing keys
    }
    // We use renderHook without destructuring rerender to avoid TS lint error
    renderHook(() => useSudokuSolver(incompletePoolState, mockDispatch))

    // Should trigger refill for all difficulties because lookup returns undefined -> [] -> length 0
    expect(mockDispatch).toHaveBeenCalledTimes(4)
  })

  it('should NOT trigger pool refill when pool is full', () => {
    renderHook(() => useSudokuSolver(fullPoolState, mockDispatch))

    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REQUEST_POOL_REFILL' }),
    )
    expect(mockWorkerInstance.postMessage).not.toHaveBeenCalled()
  })

  it('should post a message to the worker when isSolving becomes true', () => {
    const solvingState: SudokuState = {
      ...fullPoolState,
      solver: { ...initialState.solver, isSolving: true },
    }
    const { rerender } = renderHook((props) => useSudokuSolver(props.state, props.dispatch), {
      initialProps: { state: fullPoolState, dispatch: mockDispatch },
    })

    rerender({ state: solvingState, dispatch: mockDispatch })

    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
      type: 'solve',
      boardString: expect.any(String),
    })
  })

  it('should dispatch GENERATE_PUZZLE_SUCCESS when receiving user-sourced puzzle', () => {
    renderHook(() => useSudokuSolver(fullPoolState, mockDispatch))

    mockWorkerInstance.__simulateMessage({
      type: 'puzzle_generated',
      puzzleString: '...',
      solutionString: '...',
      difficulty: 'easy',
      source: 'user',
    })

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'GENERATE_PUZZLE_SUCCESS',
      puzzleString: '...',
      solutionString: '...',
    })
    expect(toast.success).toHaveBeenCalledWith('New puzzle generated!')
  })

  it('should dispatch POOL_REFILL_SUCCESS when receiving pool-sourced puzzle', () => {
    renderHook(() => useSudokuSolver(fullPoolState, mockDispatch))

    mockWorkerInstance.__simulateMessage({
      type: 'puzzle_generated',
      puzzleString: '...',
      solutionString: '...',
      difficulty: 'medium',
      source: 'pool',
    })

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'POOL_REFILL_SUCCESS',
      difficulty: 'medium',
      puzzleString: '...',
      solutionString: '...',
    })
    // No toast for background tasks
    expect(toast.success).not.toHaveBeenCalledWith('New puzzle generated!')
  })

  it('should do nothing if puzzle_generated has unknown source', () => {
    renderHook(() => useSudokuSolver(fullPoolState, mockDispatch))

    mockWorkerInstance.__simulateMessage({
      type: 'puzzle_generated',
      puzzleString: '...',
      solutionString: '...',
      difficulty: 'medium',
      source: 'unknown' as unknown as 'user',
    })

    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('should do nothing if puzzle_generated has missing fields', () => {
    renderHook(() => useSudokuSolver(fullPoolState, mockDispatch))

    mockWorkerInstance.__simulateMessage({
      type: 'puzzle_generated',
      puzzleString: '', // empty
      solutionString: '...',
      difficulty: 'medium',
      source: 'user',
    })

    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('should dispatch SOLVE_SUCCESS on receiving a solution message', () => {
    renderHook(() => useSudokuSolver(fullPoolState, mockDispatch))

    const mockResult: SolveResult = {
      steps: [],
      solution: '1'.repeat(81),
    }

    mockWorkerInstance.__simulateMessage({
      type: 'solution',
      result: mockResult,
    })

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SOLVE_SUCCESS',
      result: mockResult,
    })
    expect(toast.success).toHaveBeenCalledWith('Sudoku solved successfully!')
  })

  it('should dispatch VALIDATE_PUZZLE_SUCCESS on receiving a valid validation_result', () => {
    renderHook(() => useSudokuSolver(fullPoolState, mockDispatch))

    const solutionString = '1'.repeat(81)

    mockWorkerInstance.__simulateMessage({
      type: 'validation_result',
      isValid: true,
      solutionString,
    })

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'VALIDATE_PUZZLE_SUCCESS',
      solutionString,
    })
    expect(toast.success).toHaveBeenCalledWith('Puzzle is valid and has a unique solution.')
  })

  it('should dispatch VALIDATE_PUZZLE_FAILURE on receiving an invalid validation_result', () => {
    renderHook(() => useSudokuSolver(fullPoolState, mockDispatch))

    mockWorkerInstance.__simulateMessage({
      type: 'validation_result',
      isValid: false,
      solutionString: '',
    })

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'VALIDATE_PUZZLE_FAILURE',
      error: 'Puzzle is invalid or does not have a unique solution.',
    })
  })

  it('should do nothing if solution message is missing result object', () => {
    renderHook(() => useSudokuSolver(fullPoolState, mockDispatch))
    mockWorkerInstance.__simulateMessage({
      type: 'solution',
      result: undefined as unknown as SolveResult,
    })
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('should dispatch SOLVE_FAILURE on receiving an error message during solving', () => {
    const solvingState: SudokuState = {
      ...fullPoolState,
      solver: { ...initialState.solver, isSolving: true },
    }
    renderHook(() => useSudokuSolver(solvingState, mockDispatch))

    const errorMessage = 'No solution found'
    mockWorkerInstance.__simulateMessage({ type: 'error', error: errorMessage })
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'SOLVE_FAILURE' })
    expect(toast.error).toHaveBeenCalledWith(`Operation failed: ${errorMessage}`)
  })

  it('should dispatch GENERATE_PUZZLE_FAILURE on worker error during generation', () => {
    const generatingState: SudokuState = {
      ...fullPoolState,
      solver: {
        ...initialState.solver,
        isGenerating: true,
        generationDifficulty: 'hard',
      },
    }
    renderHook(() => useSudokuSolver(generatingState, mockDispatch))

    const errorMessage = 'Generation failed'
    mockWorkerInstance.__simulateMessage({ type: 'error', error: errorMessage })

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GENERATE_PUZZLE_FAILURE' })
    expect(toast.error).toHaveBeenCalledWith(`Operation failed: ${errorMessage}`)
  })

  it('should dispatch VALIDATE_PUZZLE_FAILURE on worker error during validation', () => {
    const validatingState: SudokuState = {
      ...fullPoolState,
      solver: { ...initialState.solver, isValidating: true },
    }
    renderHook(() => useSudokuSolver(validatingState, mockDispatch))

    const errorMessage = 'Validation crashed'
    mockWorkerInstance.__simulateMessage({ type: 'error', error: errorMessage })

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'VALIDATE_PUZZLE_FAILURE',
      error: errorMessage,
    })
    expect(toast.error).toHaveBeenCalledWith(`Operation failed: ${errorMessage}`)
  })

  it('should NOT dispatch failure or show toast on worker error if state is idle (background error)', () => {
    // State is idle (not solving, generating, validating)
    renderHook(() => useSudokuSolver(fullPoolState, mockDispatch))

    const errorMessage = 'Background worker error'
    mockWorkerInstance.__simulateMessage({ type: 'error', error: errorMessage })

    expect(mockDispatch).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('should do nothing if error message is missing error string', () => {
    renderHook(() => useSudokuSolver(fullPoolState, mockDispatch))
    mockWorkerInstance.__simulateMessage({ type: 'error', error: undefined as unknown as string })
    expect(mockDispatch).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('should handle worker initialization failure', () => {
    vi.mocked(SolverWorker).mockImplementation(function () {
      throw new Error('Worker failed')
    })

    renderHook(() => useSudokuSolver(initialState, mockDispatch))

    expect(toast.error).toHaveBeenCalledWith('Solver functionality is unavailable.')
  })

  it('should handle case where worker is not available when solving starts', () => {
    vi.mocked(SolverWorker).mockImplementation(function () {
      throw new Error('Worker instantiation failed')
    })

    const { rerender } = renderHook((props) => useSudokuSolver(props.state, props.dispatch), {
      initialProps: { state: fullPoolState, dispatch: mockDispatch },
    })

    expect(toast.error).toHaveBeenCalledWith('Solver functionality is unavailable.')

    const solvingState: SudokuState = {
      ...fullPoolState,
      solver: { ...initialState.solver, isSolving: true },
    }
    mockDispatch.mockClear()
    rerender({ state: solvingState, dispatch: mockDispatch })

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'SOLVE_FAILURE' })
  })

  it('should handle case where worker is not available when generating starts', () => {
    vi.mocked(SolverWorker).mockImplementation(function () {
      throw new Error('Worker instantiation failed')
    })

    const { rerender } = renderHook((props) => useSudokuSolver(props.state, props.dispatch), {
      initialProps: { state: fullPoolState, dispatch: mockDispatch },
    })

    const generatingState: SudokuState = {
      ...fullPoolState,
      solver: {
        ...initialState.solver,
        isGenerating: true,
        generationDifficulty: 'easy',
      },
    }
    mockDispatch.mockClear()
    rerender({ state: generatingState, dispatch: mockDispatch })

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'GENERATE_PUZZLE_FAILURE' })
  })

  it('should handle case where worker is not available when validating starts', () => {
    vi.mocked(SolverWorker).mockImplementation(function () {
      throw new Error('Worker instantiation failed')
    })

    const { rerender } = renderHook((props) => useSudokuSolver(props.state, props.dispatch), {
      initialProps: { state: fullPoolState, dispatch: mockDispatch },
    })

    const validatingState: SudokuState = {
      ...fullPoolState,
      solver: { ...initialState.solver, isValidating: true },
    }
    mockDispatch.mockClear()
    rerender({ state: validatingState, dispatch: mockDispatch })

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'VALIDATE_PUZZLE_FAILURE',
      error: 'Solver functionality is unavailable.',
    })
  })

  it('should not post a message if isGenerating is true but difficulty is missing', () => {
    const invalidGenState: SudokuState = {
      ...fullPoolState,
      solver: {
        ...initialState.solver,
        isGenerating: true,
        generationDifficulty: null,
      },
    }
    const { rerender } = renderHook((props) => useSudokuSolver(props.state, props.dispatch), {
      initialProps: { state: fullPoolState, dispatch: mockDispatch },
    })

    // Clear any previous calls (though fullPoolState should prevent refill requests)
    mockWorkerInstance.postMessage.mockClear()

    rerender({ state: invalidGenState, dispatch: mockDispatch })

    expect(mockWorkerInstance.postMessage).not.toHaveBeenCalled()
  })
})
