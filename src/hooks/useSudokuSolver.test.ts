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

import { renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { initialState } from '@/context/sudoku.reducer'
import type { SudokuState } from '@/context/sudoku.types'
import { Priority, WorkerPool } from '@/lib/worker-pool'

import { useSudokuSolver } from './useSudokuSolver'

// Hoist mocks to avoid TDZ issues
const { mockRunTask, mockTerminate } = vi.hoisted(() => {
  return {
    mockRunTask: vi.fn(),
    mockTerminate: vi.fn(),
  }
})

// We need to support new WorkerPool()
vi.mock('@/lib/worker-pool', () => {
  return {
    Priority: {
      HIGH: 0,
      LOW: 1,
    },
    WorkerPool: vi.fn(function () {
      return {
        runTask: mockRunTask,
        terminate: mockTerminate,
      }
    }),
  }
})

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('useSudokuSolver', () => {
  const mockDispatch = vi.fn()

  const fullPoolState: SudokuState = {
    ...initialState,
    puzzlePool: {
      easy: new Array(3).fill({ puzzleString: '', solutionString: '' }),
      medium: new Array(3).fill({ puzzleString: '', solutionString: '' }),
      hard: new Array(3).fill({ puzzleString: '', solutionString: '' }),
      extreme: new Array(3).fill({ puzzleString: '', solutionString: '' }),
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRunTask.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('initializes WorkerPool on mount and terminates on unmount', () => {
    const { unmount } = renderHook(() => useSudokuSolver(initialState, mockDispatch))
    expect(WorkerPool).toHaveBeenCalledOnce()
    unmount()
    expect(mockTerminate).toHaveBeenCalledOnce()
  })

  it('does NOT trigger actions if WorkerPool fails to initialize', async () => {
    // Simulate constructor failure
    vi.mocked(WorkerPool).mockImplementationOnce(() => {
      throw new Error('Init failed')
    })

    // Console error suppression for the throwing constructor
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Render with solving active. Since initialization throws, poolRef.current stays null.
    // The solving effect runs but should return early because !poolRef.current.
    const solvingState: SudokuState = {
      ...fullPoolState,
      solver: { ...initialState.solver, isSolving: true },
    }

    // Hook should not throw now due to internal try/catch
    renderHook(() => useSudokuSolver(solvingState, mockDispatch))

    expect(mockRunTask).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize WorkerPool:', expect.any(Error))
    consoleSpy.mockRestore()
  })

  it('skips pool refill if WorkerPool is not initialized', async () => {
    // Simulate constructor failure so poolRef.current is null
    vi.mocked(WorkerPool).mockImplementationOnce(() => {
      throw new Error('Init failed')
    })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Hook should not throw
    renderHook(() => useSudokuSolver(initialState, mockDispatch))

    // Should not dispatch any refill requests because hook returned early
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REQUEST_POOL_REFILL' }),
    )
    consoleSpy.mockRestore()
  })

  it('handles missing keys in puzzlePool/poolRequestCount during refill check', async () => {
    // Provide a state with empty/missing objects for pool data to trigger the `|| []` and `|| 0` fallbacks

    const brokenPoolState: SudokuState = {
      ...initialState,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      puzzlePool: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      poolRequestCount: {} as any,
    }

    // Setup mock for runTask to avoid errors when it's called
    mockRunTask.mockResolvedValue({ puzzleString: 'p', solutionString: 's' })

    renderHook(() => useSudokuSolver(brokenPoolState, mockDispatch))

    // It should iterate through DIFFICULTIES, find missing keys, use defaults (empty),
    // see that 0 < MIN_POOL_SIZE, and request refills.
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'REQUEST_POOL_REFILL',
        difficulty: 'easy',
      })
    })
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'REQUEST_POOL_REFILL',
      difficulty: 'extreme',
    })
  })

  it('triggers user puzzle generation (High Priority)', async () => {
    const generatingState: SudokuState = {
      ...fullPoolState,
      solver: {
        ...initialState.solver,
        isGenerating: true,
        generationDifficulty: 'hard',
      },
    }

    mockRunTask.mockResolvedValueOnce({
      puzzleString: 'puzzle',
      solutionString: 'solution',
    })

    renderHook(() => useSudokuSolver(generatingState, mockDispatch))

    expect(mockRunTask).toHaveBeenCalledWith('generate', { difficulty: 'hard' }, Priority.HIGH)

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'GENERATE_PUZZLE_SUCCESS',
        puzzleString: 'puzzle',
        solutionString: 'solution',
      })
      expect(toast.success).toHaveBeenCalledWith('New puzzle generated!')
    })
  })

  it('handles user generation failure', async () => {
    const generatingState: SudokuState = {
      ...fullPoolState,
      solver: {
        ...initialState.solver,
        isGenerating: true,
        generationDifficulty: 'hard',
      },
    }
    const errorMsg = 'Gen Fail'
    mockRunTask.mockRejectedValueOnce(new Error(errorMsg))

    // Spy on console error to prevent test noise
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderHook(() => useSudokuSolver(generatingState, mockDispatch))

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'GENERATE_PUZZLE_FAILURE' })
      expect(toast.error).toHaveBeenCalledWith(`Operation failed: ${errorMsg}`)
    })
    consoleSpy.mockRestore()
  })

  it('triggers puzzle solving (High Priority)', async () => {
    const solvingState: SudokuState = {
      ...fullPoolState,
      solver: { ...initialState.solver, isSolving: true },
      board: initialState.board, // all nulls
    }
    const mockResult = { solution: 'solved', steps: [] }
    mockRunTask.mockResolvedValueOnce(mockResult)

    renderHook(() => useSudokuSolver(solvingState, mockDispatch))

    expect(mockRunTask).toHaveBeenCalledWith(
      'solve',
      { boardString: '.'.repeat(81) },
      Priority.HIGH,
    )

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SOLVE_SUCCESS',
        result: mockResult,
      })
      expect(toast.success).toHaveBeenCalledWith('Sudoku solved successfully!')
    })
  })

  it('triggers puzzle validation (High Priority)', async () => {
    const validatingState: SudokuState = {
      ...fullPoolState,
      solver: { ...initialState.solver, isValidating: true },
    }
    mockRunTask.mockResolvedValueOnce({ isValid: true, solutionString: 'sol' })

    renderHook(() => useSudokuSolver(validatingState, mockDispatch))

    expect(mockRunTask).toHaveBeenCalledWith(
      'validate',
      { boardString: '.'.repeat(81) },
      Priority.HIGH,
    )

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'VALIDATE_PUZZLE_SUCCESS',
        solutionString: 'sol',
      })
    })
  })

  it('handles puzzle validation failure (invalid puzzle)', async () => {
    const validatingState: SudokuState = {
      ...fullPoolState,
      solver: { ...initialState.solver, isValidating: true },
    }
    mockRunTask.mockResolvedValueOnce({ isValid: false, solutionString: '' })

    renderHook(() => useSudokuSolver(validatingState, mockDispatch))

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'VALIDATE_PUZZLE_FAILURE',
          error: 'Puzzle is invalid or does not have a unique solution.',
        }),
      )
    })
  })

  it('handles puzzle validation worker error', async () => {
    const validatingState: SudokuState = {
      ...fullPoolState,
      solver: { ...initialState.solver, isValidating: true },
    }
    const errorMsg = 'Validation Error'
    mockRunTask.mockRejectedValueOnce(new Error(errorMsg))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderHook(() => useSudokuSolver(validatingState, mockDispatch))

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'VALIDATE_PUZZLE_FAILURE',
        error: errorMsg,
      })
      expect(toast.error).toHaveBeenCalledWith(`Operation failed: ${errorMsg}`)
    })
    consoleSpy.mockRestore()
  })

  it('triggers pool refill (Low Priority) when needed', async () => {
    // Using initialState which has empty pools
    mockRunTask.mockResolvedValue({ puzzleString: 'p', solutionString: 's' })

    renderHook(() => useSudokuSolver(initialState, mockDispatch))

    // Should request for all 4 difficulties
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'REQUEST_POOL_REFILL',
        difficulty: 'easy',
      })
      expect(mockRunTask).toHaveBeenCalledWith('generate', { difficulty: 'easy' }, Priority.LOW)
    })
  })

  it('handles pool refill failure (Low Priority)', async () => {
    // initialState has empty pools
    mockRunTask.mockRejectedValueOnce(new Error('Background Fail'))
    // Spy on console.error since the hook logs it
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderHook(() => useSudokuSolver(initialState, mockDispatch))

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'POOL_REFILL_FAILURE',
        difficulty: 'easy', // First one usually
      })
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Background refill failed'),
        expect.any(Error),
      )
    })
    consoleErrorSpy.mockRestore()
  })

  it('handles errors gracefully during solve', async () => {
    const solvingState: SudokuState = {
      ...fullPoolState,
      solver: { ...initialState.solver, isSolving: true },
    }
    mockRunTask.mockRejectedValueOnce(new Error('Fail'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderHook(() => useSudokuSolver(solvingState, mockDispatch))

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'SOLVE_FAILURE' })
      expect(toast.error).toHaveBeenCalledWith('Operation failed: Fail')
    })
    consoleSpy.mockRestore()
  })
})
