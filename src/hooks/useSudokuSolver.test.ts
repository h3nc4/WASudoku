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

import { renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { initialState } from '@/context/sudoku.reducer'
import { DIFFICULTIES } from '@/context/sudoku.types'
import { Lane, WorkerPool } from '@/lib/worker-pool'
import { makeState } from '@/test/sudoku-state'

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
    Lane: { FOREGROUND: 'foreground', BACKGROUND: 'background' },
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

// Longer than scheduleIdle's fallback delay, so an idle callback would have run.
const IDLE_WAIT_MS = 300

describe('useSudokuSolver', () => {
  const mockDispatch = vi.fn()

  const fullPoolState = makeState({
    puzzlePool: {
      easy: new Array(3).fill({ puzzleString: '', solutionString: '' }),
      medium: new Array(3).fill({ puzzleString: '', solutionString: '' }),
      hard: new Array(3).fill({ puzzleString: '', solutionString: '' }),
      expert: new Array(3).fill({ puzzleString: '', solutionString: '' }),
      extreme: new Array(3).fill({ puzzleString: '', solutionString: '' }),
    },
  })

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
    const solvingState = makeState({ solver: { isSolving: true } }, fullPoolState)

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

    expect(mockRunTask).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('generates a puzzle for the player on the foreground worker', async () => {
    const generatingState = makeState(
      { solver: { isGenerating: true, generationDifficulty: 'hard' } },
      fullPoolState,
    )

    mockRunTask.mockResolvedValueOnce({
      puzzleString: 'puzzle',
      solutionString: 'solution',
    })

    renderHook(() => useSudokuSolver(generatingState, mockDispatch))

    expect(mockRunTask).toHaveBeenCalledWith('generate', { difficulty: 'hard' })

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
    const generatingState = makeState(
      { solver: { isGenerating: true, generationDifficulty: 'hard' } },
      fullPoolState,
    )
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

  it('solves the board on the foreground worker', async () => {
    const solvingState = makeState(
      { solver: { isSolving: true }, board: initialState.board }, // all nulls
      fullPoolState,
    )
    const mockResult = { solution: 'solved', steps: [] }
    mockRunTask.mockResolvedValueOnce(mockResult)

    renderHook(() => useSudokuSolver(solvingState, mockDispatch))

    expect(mockRunTask).toHaveBeenCalledWith('solve', { boardString: '.'.repeat(81) })

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'SOLVE_SUCCESS',
        result: mockResult,
      })
      expect(toast.success).toHaveBeenCalledWith(
        'Solver finished. Step through its solution beside the board.',
      )
    })
  })

  it('solves the current board for a hint and reports the result', async () => {
    const hintingState = makeState({ solver: { isHinting: true } }, fullPoolState)
    const mockResult = { solution: null, steps: [] }
    mockRunTask.mockResolvedValueOnce(mockResult)

    renderHook(() => useSudokuSolver(hintingState, mockDispatch))

    expect(mockRunTask).toHaveBeenCalledWith('solve', { boardString: '.'.repeat(81) })
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'HINT_SUCCESS', result: mockResult })
    })
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('reports a hint failure when the solver rejects', async () => {
    const hintingState = makeState({ solver: { isHinting: true } }, fullPoolState)
    mockRunTask.mockRejectedValueOnce(new Error('No solution found for the given puzzle.'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    renderHook(() => useSudokuSolver(hintingState, mockDispatch))

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({ type: 'HINT_FAILURE' })
    })
    consoleSpy.mockRestore()
  })

  it('validates the board on the foreground worker', async () => {
    const validatingState = makeState({ solver: { isValidating: true } }, fullPoolState)
    mockRunTask.mockResolvedValueOnce({ isValid: true, solutionString: 'sol' })

    renderHook(() => useSudokuSolver(validatingState, mockDispatch))

    expect(mockRunTask).toHaveBeenCalledWith('validate', { boardString: '.'.repeat(81) })

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'VALIDATE_PUZZLE_SUCCESS',
        solutionString: 'sol',
      })
    })
  })

  it('handles puzzle validation failure (invalid puzzle)', async () => {
    const validatingState = makeState({ solver: { isValidating: true } }, fullPoolState)
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
    const validatingState = makeState({ solver: { isValidating: true } }, fullPoolState)
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

  it('refills an empty pool on the background worker in one dispatch per round', async () => {
    mockRunTask.mockResolvedValue({ puzzleString: 'p', solutionString: 's' })

    renderHook(() => useSudokuSolver(initialState, mockDispatch))

    expect(mockRunTask).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'POOL_REFILL',
        puzzles: DIFFICULTIES.map((difficulty) => ({
          difficulty,
          puzzleString: 'p',
          solutionString: 's',
        })),
      })
    })
    expect(mockRunTask).toHaveBeenCalledWith('generate', { difficulty: 'easy' }, Lane.BACKGROUND)
  })

  it('stops refilling once unmounted', async () => {
    const { unmount } = renderHook(() => useSudokuSolver(initialState, mockDispatch))
    unmount()

    await new Promise((resolve) => setTimeout(resolve, IDLE_WAIT_MS))
    expect(mockRunTask).not.toHaveBeenCalled()
  })

  it('handles errors gracefully during solve', async () => {
    const solvingState = makeState({ solver: { isSolving: true } }, fullPoolState)
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
