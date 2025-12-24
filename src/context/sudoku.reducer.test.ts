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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { areBoardsEqual, calculateCandidates, getRelatedCellIndices } from '@/lib/utils'

import type { SudokuAction } from './sudoku.actions.types'
import {
  createEmptyBoard,
  initialState,
  loadInitialState,
  STORAGE_KEYS,
  sudokuReducer,
} from './sudoku.reducer'
import type {
  BoardState,
  PersistedGameState,
  PersistedMetrics,
  PersistedPool,
  PuzzleData,
  SolvingStep,
  SudokuState,
} from './sudoku.types'

// Mock utils to spy on calculateCandidates
vi.mock('@/lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils')>()
  return {
    ...actual,
    calculateCandidates: vi.fn((board) => actual.calculateCandidates(board)),
  }
})

describe('sudokuReducer', () => {
  describe('SET_CELL_VALUE', () => {
    it('should set a value, clear own pencil marks, and update history', () => {
      const stateWithPencilMarks: SudokuState = {
        ...initialState,
        board: initialState.board.map((cell, i) =>
          i === 0 ? { ...cell, candidates: new Set([1, 2]), centers: new Set<number>() } : cell,
        ),
      }
      const action: SudokuAction = { type: 'SET_CELL_VALUE', index: 0, value: 5 }
      const newState = sudokuReducer(stateWithPencilMarks, action)

      expect(newState.board[0].value).toBe(5)
      expect(newState.board[0].candidates.size).toBe(0)
      expect(newState.history.stack).toHaveLength(2)
      expect(newState.history.index).toBe(1)
      expect(newState.solver.isSolved).toBe(false)
      expect(newState.solver.solveFailed).toBe(false)
    })

    it('should increment mistakes if value does not match solution', () => {
      const state: SudokuState = {
        ...initialState,
        solver: {
          ...initialState.solver,
          gameMode: 'playing',
          solution: [1, ...new Array(80).fill(0)], // Solution expects 1 at index 0
        },
      }
      const action: SudokuAction = { type: 'SET_CELL_VALUE', index: 0, value: 5 } // Entering 5 is wrong
      const newState = sudokuReducer(state, action)

      expect(newState.game.mistakes).toBe(1)
    })

    it('should not increment mistakes if value matches solution', () => {
      const state: SudokuState = {
        ...initialState,
        solver: {
          ...initialState.solver,
          gameMode: 'playing',
          solution: [1, ...new Array(80).fill(0)],
        },
      }
      const action: SudokuAction = { type: 'SET_CELL_VALUE', index: 0, value: 1 } // Correct
      const newState = sudokuReducer(state, action)

      expect(newState.game.mistakes).toBe(0)
    })

    it('should not increment mistakes if solution is null', () => {
      const state: SudokuState = {
        ...initialState,
        solver: {
          ...initialState.solver,
          gameMode: 'playing',
          solution: null,
        },
      }
      const action: SudokuAction = { type: 'SET_CELL_VALUE', index: 0, value: 5 }
      const newState = sudokuReducer(state, action)

      expect(newState.game.mistakes).toBe(0)
    })

    it('should detect when puzzle is completely solved by user', () => {
      const solution = new Array(81).fill(0).map((_, i) => (i % 9) + 1)
      // Setup board with all but last cell filled correctly
      const nearlySolvedBoard = createEmptyBoard().map((cell, i) =>
        i < 80 ? { ...cell, value: solution[i] } : cell,
      )

      const state: SudokuState = {
        ...initialState,
        board: nearlySolvedBoard,
        solver: {
          ...initialState.solver,
          gameMode: 'playing',
          solution,
          isSolved: false,
        },
      }

      const action: SudokuAction = {
        type: 'SET_CELL_VALUE',
        index: 80,
        value: solution[80],
      }
      const newState = sudokuReducer(state, action)

      expect(newState.solver.isSolved).toBe(true)
    })

    it('should return original state if value is already set', () => {
      const stateWithValue = sudokuReducer(initialState, {
        type: 'SET_CELL_VALUE',
        index: 0,
        value: 5,
      })
      const historyLength = stateWithValue.history.stack.length
      const newState = sudokuReducer(stateWithValue, {
        type: 'SET_CELL_VALUE',
        index: 0,
        value: 5,
      })
      expect(newState).toBe(stateWithValue)
      expect(newState.history.stack.length).toBe(historyLength)
    })

    it('should not allow changing a "given" cell in playing mode', () => {
      const stateWithGiven: SudokuState = {
        ...initialState,
        solver: { ...initialState.solver, gameMode: 'playing' },
        board: initialState.board.map((c, i) => (i === 0 ? { ...c, isGiven: true } : c)),
      }
      const action: SudokuAction = { type: 'SET_CELL_VALUE', index: 0, value: 5 }
      const newState = sudokuReducer(stateWithGiven, action)
      expect(newState).toBe(stateWithGiven)
    })

    it('should clear related pencil marks (candidates and centers)', () => {
      const state: SudokuState = {
        ...initialState,
        board: initialState.board.map((cell, i) => {
          if (i === 1) return { ...cell, candidates: new Set([5]) }
          if (i === 9) return { ...cell, centers: new Set([5]) }
          return cell
        }),
      }

      const action: SudokuAction = { type: 'SET_CELL_VALUE', index: 0, value: 5 }
      const newState = sudokuReducer(state, action)

      expect(newState.board[0].value).toBe(5)
      const relatedIndices = getRelatedCellIndices(0)
      relatedIndices.forEach((i) => {
        if (i !== 0) {
          expect(newState.board[i].candidates.has(5)).toBe(false)
          expect(newState.board[i].centers.has(5)).toBe(false)
        }
      })
    })

    it('should truncate future history when making a new move', () => {
      let state = sudokuReducer(initialState, {
        type: 'SET_CELL_VALUE',
        index: 0,
        value: 1,
      })
      state = sudokuReducer(state, {
        type: 'SET_CELL_VALUE',
        index: 1,
        value: 2,
      })
      state = sudokuReducer(state, { type: 'UNDO' }) // history.index is now 1

      const newState = sudokuReducer(state, {
        type: 'SET_CELL_VALUE',
        index: 2,
        value: 3,
      })
      expect(newState.history.stack).toHaveLength(3) // [empty, {0:1}, {0:1, 2:3}]
      expect(newState.history.index).toBe(2)
      expect(newState.board[1].value).toBe(null) // The undone move is gone
    })
  })

  describe('TOGGLE_PENCIL_MARK', () => {
    it('should add a candidate mark', () => {
      const action: SudokuAction = {
        type: 'TOGGLE_PENCIL_MARK',
        index: 0,
        value: 1,
        mode: 'candidate',
      }
      const newState = sudokuReducer(initialState, action)
      expect(newState.board[0].candidates.has(1)).toBe(true)
    })

    it('should remove an existing candidate mark', () => {
      const stateWithMark = sudokuReducer(initialState, {
        type: 'TOGGLE_PENCIL_MARK',
        index: 0,
        value: 1,
        mode: 'candidate',
      })
      const action: SudokuAction = {
        type: 'TOGGLE_PENCIL_MARK',
        index: 0,
        value: 1,
        mode: 'candidate',
      }
      const newState = sudokuReducer(stateWithMark, action)
      expect(newState.board[0].candidates.has(1)).toBe(false)
    })

    it('should not add a pencil mark if the cell has a value', () => {
      const stateWithValue = sudokuReducer(initialState, {
        type: 'SET_CELL_VALUE',
        index: 0,
        value: 5,
      })
      const action: SudokuAction = {
        type: 'TOGGLE_PENCIL_MARK',
        index: 0,
        value: 1,
        mode: 'candidate',
      }
      const newState = sudokuReducer(stateWithValue, action)
      expect(newState).toBe(stateWithValue)
      expect(newState.board[0].candidates.has(1)).toBe(false)
    })

    it('should not add a pencil mark to a "given" cell', () => {
      const stateWithGiven: SudokuState = {
        ...initialState,
        solver: { ...initialState.solver, gameMode: 'playing' },
        board: initialState.board.map((c, i) => (i === 0 ? { ...c, isGiven: true } : c)),
      }
      const action: SudokuAction = {
        type: 'TOGGLE_PENCIL_MARK',
        index: 0,
        value: 1,
        mode: 'candidate',
      }
      const newState = sudokuReducer(stateWithGiven, action)
      expect(newState).toBe(stateWithGiven)
    })

    it('should not add a conflicting candidate mark', () => {
      const stateWithPeerValue = sudokuReducer(initialState, {
        type: 'SET_CELL_VALUE',
        index: 1, // Peer cell
        value: 5,
      })
      const action: SudokuAction = {
        type: 'TOGGLE_PENCIL_MARK',
        index: 0, // Target cell
        value: 5, // Conflicting value
        mode: 'candidate',
      }
      const newState = sudokuReducer(stateWithPeerValue, action)
      expect(newState.board[0].candidates.has(5)).toBe(false)
      expect(newState).toBe(stateWithPeerValue) // State should be unchanged
    })

    it('should not add a conflicting center mark', () => {
      const stateWithPeerValue = sudokuReducer(initialState, {
        type: 'SET_CELL_VALUE',
        index: 1, // Peer cell
        value: 5,
      })
      const action: SudokuAction = {
        type: 'TOGGLE_PENCIL_MARK',
        index: 0, // Target cell
        value: 5, // Conflicting value
        mode: 'center',
      }
      const newState = sudokuReducer(stateWithPeerValue, action)
      expect(newState.board[0].centers.has(5)).toBe(false)
      expect(newState).toBe(stateWithPeerValue) // State should be unchanged
    })

    it('should clear candidates when adding a center mark', () => {
      const stateWithCandidates = sudokuReducer(initialState, {
        type: 'TOGGLE_PENCIL_MARK',
        index: 0,
        value: 1,
        mode: 'candidate',
      })
      const action: SudokuAction = {
        type: 'TOGGLE_PENCIL_MARK',
        index: 0,
        value: 5,
        mode: 'center',
      }
      const newState = sudokuReducer(stateWithCandidates, action)
      expect(newState.board[0].candidates.size).toBe(0)
      expect(newState.board[0].centers.has(5)).toBe(true)
    })

    it('should remove an existing center mark', () => {
      const stateWithMark = sudokuReducer(initialState, {
        type: 'TOGGLE_PENCIL_MARK',
        index: 0,
        value: 5,
        mode: 'center',
      })
      const action: SudokuAction = {
        type: 'TOGGLE_PENCIL_MARK',
        index: 0,
        value: 5,
        mode: 'center',
      }
      const newState = sudokuReducer(stateWithMark, action)
      expect(newState.board[0].centers.has(5)).toBe(false)
    })
  })

  describe('AUTO_FILL_CANDIDATES', () => {
    it('should populate candidates for all empty cells based on current board state', () => {
      // Setup: Cell 0 has value 1. Cell 1 is empty (peer). Cell 80 is empty (non-peer).
      const boardWithVal = initialState.board.map((c, i) => (i === 0 ? { ...c, value: 1 } : c))
      const state: SudokuState = {
        ...initialState,
        board: boardWithVal,
        solver: { ...initialState.solver, gameMode: 'playing' },
      }

      const newState = sudokuReducer(state, { type: 'AUTO_FILL_CANDIDATES' })

      // Peer cell (1) should NOT have 1 as a candidate
      expect(newState.board[1].candidates.has(1)).toBe(false)
      expect(newState.board[1].candidates.size).toBe(8) // 9 minus the 1

      // Non-peer cell (80) should have all candidates including 1
      expect(newState.board[80].candidates.has(1)).toBe(true)
      expect(newState.board[80].candidates.size).toBe(9)

      // History should update
      expect(newState.history.stack).toHaveLength(2)
    })

    it('should clear existing centers and candidates before filling', () => {
      const boardWithCenters = initialState.board.map((c, i) =>
        i === 1 ? { ...c, centers: new Set([5]), candidates: new Set([2]) } : c,
      )
      const state: SudokuState = {
        ...initialState,
        board: boardWithCenters,
        solver: { ...initialState.solver, gameMode: 'playing' },
      }

      const newState = sudokuReducer(state, { type: 'AUTO_FILL_CANDIDATES' })

      expect(newState.board[1].centers.size).toBe(0)
      expect(newState.board[1].candidates.size).toBe(9) // Should be full set now
    })

    it('should do nothing if not in playing mode', () => {
      const state: SudokuState = {
        ...initialState,
        solver: { ...initialState.solver, gameMode: 'selecting' },
      }
      const newState = sudokuReducer(state, { type: 'AUTO_FILL_CANDIDATES' })
      expect(newState).toBe(state)
    })

    it('should return original state if candidates are already filled', () => {
      // Setup: Board is empty but candidates are already calculated and set
      // Use the real calculateCandidates to simulate perfect state
      const emptyBoard = createEmptyBoard()
      const allCandidates = calculateCandidates(emptyBoard)
      const filledBoard = emptyBoard.map((cell, i) => {
        const c = allCandidates[i]
        return c ? { ...cell, candidates: c } : cell
      })

      const state: SudokuState = {
        ...initialState,
        board: filledBoard,
        solver: { ...initialState.solver, gameMode: 'playing' },
      }

      const newState = sudokuReducer(state, { type: 'AUTO_FILL_CANDIDATES' })
      expect(newState).toBe(state) // Reference equality check
    })

    it('should handle case where calculateCandidates returns null for empty cell', () => {
      const state: SudokuState = {
        ...initialState,
        solver: { ...initialState.solver, gameMode: 'playing' },
      }

      // Mock calculateCandidates to return nulls even for empty cells.
      // This forces the `if (candidates)` check to fail and fall through to `return cell`.
      // It also subsequently triggers the `areBoardsEqual` check to return `state`.
      vi.mocked(calculateCandidates).mockReturnValueOnce(new Array(81).fill(null))

      const newState = sudokuReducer(state, { type: 'AUTO_FILL_CANDIDATES' })

      // Since candidates map was null, cells should remain as is
      expect(newState.board).toEqual(state.board)
      // Since board didn't change, reference should be equal
      expect(newState).toBe(state)
    })
  })

  describe('ERASE_CELL', () => {
    it('should clear value and all pencil marks from a cell', () => {
      const stateWithValue = sudokuReducer(initialState, {
        type: 'SET_CELL_VALUE',
        index: 0,
        value: 5,
      })
      const state: SudokuState = {
        ...stateWithValue,
        board: stateWithValue.board.map((cell, i) =>
          i === 0 ? { ...cell, candidates: new Set([1]), centers: new Set([2]) } : cell,
        ),
      }
      const action: SudokuAction = { type: 'ERASE_CELL', index: 0 }
      const newState = sudokuReducer(state, action)
      expect(newState.board[0].value).toBeNull()
      expect(newState.board[0].candidates.size).toBe(0)
      expect(newState.board[0].centers.size).toBe(0)
      expect(newState.history.index).toBe(2)
    })

    it('should return original state if cell is already empty', () => {
      const state = sudokuReducer(initialState, { type: 'ERASE_CELL', index: 0 })
      expect(state).toBe(initialState)
      expect(state.history.stack.length).toBe(1)
    })

    it('should not erase a "given" cell', () => {
      const stateWithGiven: SudokuState = {
        ...initialState,
        solver: { ...initialState.solver, gameMode: 'playing' },
        board: initialState.board.map((c, i) => (i === 0 ? { ...c, isGiven: true, value: 5 } : c)),
      }
      const action: SudokuAction = { type: 'ERASE_CELL', index: 0 }
      const newState = sudokuReducer(stateWithGiven, action)
      expect(newState).toBe(stateWithGiven)
    })
  })

  describe('CLEAR_BOARD', () => {
    it('should clear user progress in playing mode and reset game metrics', () => {
      const initialBoard = createEmptyBoard().map((c, i) =>
        i === 0 ? { ...c, value: 5, isGiven: true } : c,
      )
      const boardWithProgress = initialBoard.map((c, i) =>
        i === 1 ? { ...c, value: 3, isGiven: false } : c,
      )
      const state: SudokuState = {
        ...initialState,
        board: boardWithProgress,
        initialBoard,
        solver: { ...initialState.solver, gameMode: 'playing' },
        game: { timer: 100, mistakes: 2 },
      }
      const newState = sudokuReducer(state, { type: 'CLEAR_BOARD' })
      expect(newState.board).toEqual(initialBoard)
      expect(newState.history.stack).toHaveLength(1)
      expect(areBoardsEqual(newState.history.stack[0], initialBoard)).toBe(true)
      expect(newState.game.timer).toBe(0)
      expect(newState.game.mistakes).toBe(0)
    })

    it('should return the same state instance if there is no progress to clear', () => {
      const initialBoard = createEmptyBoard().map((c, i) =>
        i === 0 ? { ...c, value: 5, isGiven: true } : c,
      )
      const state: SudokuState = {
        ...initialState,
        board: initialBoard,
        initialBoard,
        solver: { ...initialState.solver, gameMode: 'playing' },
      }
      const newState = sudokuReducer(state, { type: 'CLEAR_BOARD' })
      expect(newState).toBe(state)
    })

    it('should clear the board in customInput mode', () => {
      const boardWithInput = createEmptyBoard().map((c, i) => (i === 0 ? { ...c, value: 5 } : c))
      const state: SudokuState = {
        ...initialState,
        board: boardWithInput,
        solver: { ...initialState.solver, gameMode: 'customInput' },
        derived: { ...initialState.derived, isBoardEmpty: false },
      }
      const newState = sudokuReducer(state, { type: 'CLEAR_BOARD' })
      expect(newState.board).toEqual(createEmptyBoard())
      expect(newState.history.stack).toHaveLength(1)
      expect(newState.solver.solution).toBeNull()
      expect(newState.game.timer).toBe(0)
    })

    it('should do nothing if board is empty in customInput mode', () => {
      const state: SudokuState = {
        ...initialState,
        solver: { ...initialState.solver, gameMode: 'customInput' },
        derived: { ...initialState.derived, isBoardEmpty: true },
      }
      const newState = sudokuReducer(state, { type: 'CLEAR_BOARD' })
      expect(newState).toBe(state)
    })

    it('should do nothing when in visualizing mode', () => {
      const boardWithValues: BoardState = initialState.board.map((c) => ({
        ...c,
        isGiven: false,
        value: 1 as number | null,
        candidates: new Set<number>(),
        centers: new Set<number>(),
      }))
      const visualizingState: SudokuState = {
        ...initialState,
        solver: { ...initialState.solver, gameMode: 'visualizing' as const },
        board: boardWithValues,
        derived: {
          ...initialState.derived,
          isBoardEmpty: false,
          isBoardFull: false,
          conflicts: new Set(),
        },
      }
      const newState = sudokuReducer(visualizingState, { type: 'CLEAR_BOARD' })
      expect(newState).toBe(visualizingState)
    })
  })

  describe('IMPORT_BOARD', () => {
    it('should correctly parse the board string and reset state for playing', () => {
      const boardString =
        '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79'
      const action: SudokuAction = { type: 'IMPORT_BOARD', boardString }
      const state = {
        ...initialState,
        solver: { ...initialState.solver, gameMode: 'playing' as const },
      }
      const newState = sudokuReducer(state, action)

      expect(newState.board[0].value).toBe(5)
      expect(newState.board[0].isGiven).toBe(true)
      expect(newState.board[2].value).toBe(null)
      expect(newState.board[2].isGiven).toBe(false)
      expect(newState.board[80].value).toBe(9)

      // Check that state was reset for playing
      expect(newState.history.stack.length).toBe(1)
      expect(newState.history.index).toBe(0)
      expect(newState.history.stack[0]).toEqual(newState.initialBoard)
      expect(newState.initialBoard[0].value).toBe(5)
      expect(newState.solver.isSolved).toBe(false)
      expect(newState.solver.gameMode).toBe('playing')
      expect(newState.solver.solution).toBeNull()
      expect(newState.game.timer).toBe(0)
    })

    it('should parse the board but not set initialBoard in customInput mode', () => {
      const boardString = '1' + '.'.repeat(80)
      const action: SudokuAction = { type: 'IMPORT_BOARD', boardString }
      const state = {
        ...initialState,
        solver: { ...initialState.solver, gameMode: 'customInput' as const },
      }
      const newState = sudokuReducer(state, action)

      expect(newState.board[0].value).toBe(1)
      expect(newState.board[0].isGiven).toBe(true)
      expect(newState.solver.gameMode).toBe('customInput')

      // initialBoard should remain empty, not the imported board
      expect(newState.initialBoard).toEqual(initialState.initialBoard)
    })
  })

  describe('History (UNDO/REDO)', () => {
    const stateWithHistory: SudokuState = {
      ...initialState,
      history: {
        stack: [
          createEmptyBoard(),
          createEmptyBoard().map((c, i) => (i === 0 ? { ...c, value: 1 } : c)),
          createEmptyBoard().map((c, i) => (i === 0 ? { ...c, value: 2 } : c)),
        ],
        index: 2,
      },
    }

    it('should UNDO to the previous state', () => {
      const newState = sudokuReducer(stateWithHistory, { type: 'UNDO' })
      expect(newState.history.index).toBe(1)
      expect(newState.board).toEqual(stateWithHistory.history.stack[1])
      expect(newState.solver.solveFailed).toBe(false) // Can solve again after undo
    })

    it('should not UNDO past the beginning of history', () => {
      const stateAtStart: SudokuState = {
        ...stateWithHistory,
        history: { ...stateWithHistory.history, index: 0 },
      }
      const newState = sudokuReducer(stateAtStart, { type: 'UNDO' })
      expect(newState.history.index).toBe(0)
    })

    it('should REDO to the next state', () => {
      const stateInMiddle: SudokuState = {
        ...stateWithHistory,
        history: { ...stateWithHistory.history, index: 1 },
      }
      const newState = sudokuReducer(stateInMiddle, { type: 'REDO' })
      expect(newState.history.index).toBe(2)
      expect(newState.board).toEqual(stateWithHistory.history.stack[2])
    })

    it('should not REDO past the end of history', () => {
      const newState = sudokuReducer(stateWithHistory, { type: 'REDO' })
      expect(newState.history.index).toBe(2)
    })

    it('should prune history when it exceeds the maximum size', () => {
      let state = initialState
      const MAX_HISTORY_ENTRIES = 100 // Should match constant in reducer
      // Loop more than MAX_HISTORY_ENTRIES times, ensuring each action
      // creates a new, unique board state by cycling through values 1-9 in cell 0.
      for (let i = 0; i < MAX_HISTORY_ENTRIES + 5; i++) {
        state = sudokuReducer(state, {
          type: 'SET_CELL_VALUE',
          index: 0, // Always modify the same cell
          value: (((state.board[0].value ?? 0) % 9) + 1) as 1, // Cycle through 1-9
        })
      }
      expect(state.history.stack.length).toBe(MAX_HISTORY_ENTRIES)
      expect(state.history.index).toBe(MAX_HISTORY_ENTRIES - 1)
      // Check that the first entry is no longer the initial empty board
      expect(state.history.stack[0]).not.toEqual(createEmptyBoard())
    })
  })

  describe('Solver Actions', () => {
    it('should set solving state on SOLVE_START', () => {
      const state = sudokuReducer(initialState, { type: 'SOLVE_START' })
      expect(state.solver.isSolving).toBe(true)
      expect(state.initialBoard).toEqual(initialState.initialBoard) // Should not change
    })

    it('should handle SOLVE_SUCCESS', () => {
      const solvedBoardString = '1'.repeat(81)
      const mockResult = {
        steps: [
          {
            technique: 'NakedSingle',
            placements: [{ index: 0, value: 1 }],
            eliminations: [],
            cause: [],
          },
        ],
        solution: solvedBoardString,
      }

      const state: SudokuState = {
        ...initialState,
        solver: { ...initialState.solver, isSolving: true },
        initialBoard: createEmptyBoard().map((c, i) =>
          i === 0 ? c : { ...c, value: (i % 9) + 1, isGiven: true },
        ),
      }
      const newState = sudokuReducer(state, {
        type: 'SOLVE_SUCCESS',
        result: mockResult,
      })

      expect(newState.solver.isSolving).toBe(false)
      expect(newState.solver.isSolved).toBe(true)
      expect(newState.solver.gameMode).toBe('visualizing')
      expect(newState.solver.steps[0]).toEqual(mockResult.steps[0])
      expect(newState.solver.currentStepIndex).toBe(newState.solver.steps.length)
      expect(newState.solver.visualizationBoard?.[0].value).toBe(1)
      expect(newState.board[0].value).toBe(1)
      expect(newState.board[1].isGiven).toBe(true)
    })

    it('should handle SOLVE_SUCCESS and add a backtracking step if needed', () => {
      const solvedBoardString = '12' + '.'.repeat(79) // A full solution string
      const mockResult = {
        steps: [
          {
            technique: 'NakedSingle',
            placements: [{ index: 0, value: 1 }], // Only one logical step
            eliminations: [],
            cause: [],
          },
        ],
        solution: solvedBoardString,
      }
      const state: SudokuState = {
        ...initialState,
        solver: { ...initialState.solver, isSolving: true },
      }
      const newState = sudokuReducer(state, { type: 'SOLVE_SUCCESS', result: mockResult })

      expect(newState.solver.steps.length).toBe(2)
      expect(newState.solver.steps[1].technique).toBe('Backtracking')
      expect(newState.solver.currentStepIndex).toBe(2)
    })

    it('should handle SOLVE_SUCCESS with no solution string', () => {
      const state: SudokuState = {
        ...initialState,
        solver: { ...initialState.solver, isSolving: true },
      }
      const newState = sudokuReducer(state, {
        type: 'SOLVE_SUCCESS',
        result: { steps: [], solution: null },
      })
      expect(newState.solver.isSolving).toBe(false)
      expect(newState.solver.solveFailed).toBe(true)
    })

    it('should handle SOLVE_FAILURE', () => {
      const state: SudokuState = {
        ...initialState,
        solver: { ...initialState.solver, isSolving: true },
      }
      const newState = sudokuReducer(state, { type: 'SOLVE_FAILURE' })
      expect(newState.solver.isSolving).toBe(false)
      expect(newState.solver.solveFailed).toBe(true)
    })
  })

  describe('Generator and Custom Puzzle Actions', () => {
    it('should handle GENERATE_PUZZLE_START with empty pool', () => {
      const state = sudokuReducer(initialState, {
        type: 'GENERATE_PUZZLE_START',
        difficulty: 'hard',
      })
      expect(state.solver.isGenerating).toBe(true)
      expect(state.solver.generationDifficulty).toBe('hard')
      expect(state.puzzlePool.hard.length).toBe(0)
    })

    it('should handle GENERATE_PUZZLE_START with missing difficulty key', () => {
      const state = sudokuReducer(initialState, {
        type: 'GENERATE_PUZZLE_START',
        difficulty: 'nightmare', // Difficulty that doesn't exist in initial pool
      })
      expect(state.solver.isGenerating).toBe(true)
      expect(state.solver.generationDifficulty).toBe('nightmare')
    })

    it('should handle GENERATE_PUZZLE_START with available pool', () => {
      const mockPuzzle: PuzzleData = {
        puzzleString: '1'.repeat(81),
        solutionString: '2'.repeat(81),
      }
      const stateWithPool: SudokuState = {
        ...initialState,
        puzzlePool: { ...initialState.puzzlePool, easy: [mockPuzzle] },
      }

      const state = sudokuReducer(stateWithPool, {
        type: 'GENERATE_PUZZLE_START',
        difficulty: 'easy',
      })

      // Should NOT be generating
      expect(state.solver.isGenerating).toBe(false)
      // Should immediately start playing
      expect(state.solver.gameMode).toBe('playing')
      expect(state.board[0].value).toBe(1)
      expect(state.puzzlePool.easy.length).toBe(0) // Consumed
    })

    it('should handle GENERATE_PUZZLE_START with pool hit having solution with dots', () => {
      const mockPuzzle: PuzzleData = {
        puzzleString: '1'.repeat(81),
        solutionString: '1' + '.'.repeat(80), // Dots
      }
      const stateWithPool: SudokuState = {
        ...initialState,
        puzzlePool: { ...initialState.puzzlePool, easy: [mockPuzzle] },
      }

      const state = sudokuReducer(stateWithPool, {
        type: 'GENERATE_PUZZLE_START',
        difficulty: 'easy',
      })

      expect(state.solver.solution?.[1]).toBe(0) // Check dot parsing
    })

    it('should handle GENERATE_PUZZLE_SUCCESS', () => {
      const generatingState: SudokuState = {
        ...initialState,
        solver: {
          ...initialState.solver,
          isGenerating: true,
          generationDifficulty: 'easy',
        },
      }
      const puzzleString = '1'.repeat(81)
      const solutionString = '2'.repeat(81)
      const state = sudokuReducer(generatingState, {
        type: 'GENERATE_PUZZLE_SUCCESS',
        puzzleString,
        solutionString,
      })

      expect(state.solver.isGenerating).toBe(false)
      expect(state.solver.gameMode).toBe('playing')
      expect(state.board[0].value).toBe(1)
    })

    it('should handle GENERATE_PUZZLE_SUCCESS with dots in solution string', () => {
      const generatingState: SudokuState = {
        ...initialState,
        solver: {
          ...initialState.solver,
          isGenerating: true,
          generationDifficulty: 'easy',
        },
      }
      const puzzleString = '1'.repeat(81)
      // Dots in solution string
      const solutionString = '1' + '.'.repeat(80)
      const state = sudokuReducer(generatingState, {
        type: 'GENERATE_PUZZLE_SUCCESS',
        puzzleString,
        solutionString,
      })

      expect(state.solver.solution?.[0]).toBe(1)
      expect(state.solver.solution?.[1]).toBe(0)
    })

    it('should handle POOL_REFILL_SUCCESS', () => {
      const puzzleString = '1'.repeat(81)
      const solutionString = '2'.repeat(81)
      const state = sudokuReducer(
        {
          ...initialState,
          poolRequestCount: { ...initialState.poolRequestCount, easy: 1 },
        },
        {
          type: 'POOL_REFILL_SUCCESS',
          difficulty: 'easy',
          puzzleString,
          solutionString,
        },
      )

      expect(state.puzzlePool.easy.length).toBe(1)
      expect(state.poolRequestCount.easy).toBe(0)
      // Ensure game state wasn't affected
      expect(state.solver.gameMode).toBe('selecting')
    })

    it('should handle POOL_REFILL_SUCCESS with unknown difficulty', () => {
      const puzzleString = '1'.repeat(81)
      const solutionString = '2'.repeat(81)
      const state = sudokuReducer(initialState, {
        type: 'POOL_REFILL_SUCCESS',
        difficulty: 'custom_diff', // Unknown difficulty
        puzzleString,
        solutionString,
      })

      expect(state.puzzlePool['custom_diff']).toHaveLength(1)
      expect(state.poolRequestCount['custom_diff']).toBe(0) // Defaulted to 0 then -1 max 0
    })

    it('should handle POOL_REFILL_SUCCESS gracefully when pending count is 0', () => {
      const puzzleString = '1'.repeat(81)
      const solutionString = '2'.repeat(81)
      const state = sudokuReducer(
        {
          ...initialState,
          poolRequestCount: { ...initialState.poolRequestCount, easy: 0 },
        },
        {
          type: 'POOL_REFILL_SUCCESS',
          difficulty: 'easy',
          puzzleString,
          solutionString,
        },
      )

      expect(state.puzzlePool.easy.length).toBe(1)
      expect(state.poolRequestCount.easy).toBe(0) // Should stay 0, not -1
    })

    it('should handle POOL_REFILL_FAILURE by decrementing pending count', () => {
      const state = sudokuReducer(
        {
          ...initialState,
          poolRequestCount: { ...initialState.poolRequestCount, easy: 2 },
        },
        {
          type: 'POOL_REFILL_FAILURE',
          difficulty: 'easy',
        },
      )

      expect(state.poolRequestCount.easy).toBe(1)
    })

    it('should handle POOL_REFILL_FAILURE gracefully when count is 0', () => {
      const state = sudokuReducer(
        {
          ...initialState,
          poolRequestCount: { ...initialState.poolRequestCount, easy: 0 },
        },
        {
          type: 'POOL_REFILL_FAILURE',
          difficulty: 'easy',
        },
      )

      expect(state.poolRequestCount.easy).toBe(0)
    })

    it('should handle REQUEST_POOL_REFILL', () => {
      const state = sudokuReducer(initialState, {
        type: 'REQUEST_POOL_REFILL',
        difficulty: 'hard',
      })
      expect(state.poolRequestCount.hard).toBe(1)
    })

    it('should handle REQUEST_POOL_REFILL with a new difficulty key', () => {
      const state = sudokuReducer(initialState, {
        type: 'REQUEST_POOL_REFILL',
        difficulty: 'insane',
      })
      expect(state.poolRequestCount['insane']).toBe(1)
    })

    it('should handle GENERATE_PUZZLE_FAILURE', () => {
      const generatingState: SudokuState = {
        ...initialState,
        solver: { ...initialState.solver, isGenerating: true },
      }
      const state = sudokuReducer(generatingState, {
        type: 'GENERATE_PUZZLE_FAILURE',
      })
      expect(state.solver.isGenerating).toBe(false)
      expect(state.ui.lastError).toBe('Failed to generate a new puzzle.')
    })

    it('should handle START_CUSTOM_PUZZLE', () => {
      const state = sudokuReducer(initialState, { type: 'START_CUSTOM_PUZZLE' })
      expect(state.solver.gameMode).toBe('customInput')
      expect(state.board).toEqual(createEmptyBoard())
      expect(state.history.stack.length).toBe(1)
    })

    it('should handle VALIDATE_PUZZLE_START', () => {
      const state = sudokuReducer(initialState, { type: 'VALIDATE_PUZZLE_START' })
      expect(state.solver.isValidating).toBe(true)
    })

    it('should handle VALIDATE_PUZZLE_SUCCESS and reset timer/mistakes', () => {
      const board = initialState.board.map((c, i) => (i === 0 ? { ...c, value: 5 } : c))
      const solutionString = '5'.repeat(81)
      const state: SudokuState = {
        ...initialState,
        board,
        solver: { ...initialState.solver, isValidating: true },
        game: { timer: 500, mistakes: 2 },
      }
      const newState = sudokuReducer(state, {
        type: 'VALIDATE_PUZZLE_SUCCESS',
        solutionString,
      })
      expect(newState.solver.isValidating).toBe(false)
      expect(newState.solver.gameMode).toBe('playing')
      expect(newState.board[0].isGiven).toBe(true)
      expect(newState.board[1].isGiven).toBe(false)
      expect(newState.initialBoard).toEqual(newState.board)
      expect(newState.solver.solution?.[0]).toBe(5)
      expect(newState.game.timer).toBe(0)
      expect(newState.game.mistakes).toBe(0)
    })

    it('should handle VALIDATE_PUZZLE_SUCCESS with dots in solution string', () => {
      const state: SudokuState = {
        ...initialState,
        solver: { ...initialState.solver, isValidating: true },
      }
      const solutionStringWithDots = '9' + '.'.repeat(80)
      const newState = sudokuReducer(state, {
        type: 'VALIDATE_PUZZLE_SUCCESS',
        solutionString: solutionStringWithDots,
      })
      expect(newState.solver.solution?.[0]).toBe(9)
      expect(newState.solver.solution?.[1]).toBe(0)
    })

    it('should handle VALIDATE_PUZZLE_FAILURE', () => {
      const state: SudokuState = {
        ...initialState,
        solver: { ...initialState.solver, isValidating: true },
      }
      const newState = sudokuReducer(state, {
        type: 'VALIDATE_PUZZLE_FAILURE',
        error: 'Invalid puzzle',
      })
      expect(newState.solver.isValidating).toBe(false)
      expect(newState.ui.lastError).toBe('Invalid puzzle')
    })
  })

  describe('Visualization Actions', () => {
    const steps: SolvingStep[] = [
      {
        technique: 'NakedSingle',
        placements: [{ index: 0, value: 1 }],
        eliminations: [
          { index: 1, value: 1 },
          { index: 9, value: 1 },
          { index: 10, value: 1 },
        ],
        cause: [],
      },
      {
        technique: 'HiddenSingle',
        placements: [{ index: 2, value: 3 }],
        eliminations: [
          { index: 2, value: 4 },
          { index: 11, value: 3 },
        ],
        cause: [],
      },
    ]
    const initialBoard = createEmptyBoard().map((c, i) =>
      i === 80 ? { ...c, value: 9, isGiven: true } : c,
    )
    const solvedBoardForTest = createEmptyBoard().map((c, i) => {
      if (i === 0) return { ...c, value: 1 }
      if (i === 2) return { ...c, value: 3 }
      if (i === 80) return { ...c, value: 9, isGiven: true }
      return c
    })

    const visualizingState: SudokuState = {
      ...initialState,
      initialBoard,
      board: solvedBoardForTest,
      solver: {
        ...initialState.solver,
        gameMode: 'visualizing',
        steps,
      },
    }

    it('should handle VIEW_SOLVER_STEP correctly', () => {
      const state = sudokuReducer(visualizingState, {
        type: 'VIEW_SOLVER_STEP',
        index: 2,
      })

      expect(state.solver.currentStepIndex).toBe(2)
      expect(state.solver.visualizationBoard).not.toBeNull()
      expect(state.solver.visualizationBoard?.[0].value).toBe(1)
      expect(state.solver.visualizationBoard?.[2].value).toBe(3)
      // Highlighting for step 2 (index 2 in action -> index 1 in steps array)
      // Placed value is 3
      expect(state.ui.highlightedValue).toBe(3)
    })

    it('should correctly apply prior eliminations when viewing a later step', () => {
      const stepsWithElims: SolvingStep[] = [
        {
          technique: 'PointingPair',
          placements: [],
          eliminations: [{ index: 15, value: 5 }],
          cause: [],
        },
        {
          technique: 'NakedSingle',
          placements: [{ index: 15, value: 6 }],
          eliminations: [],
          cause: [],
        },
      ]
      const state: SudokuState = {
        ...initialState,
        solver: {
          ...initialState.solver,
          gameMode: 'visualizing',
          steps: stepsWithElims,
        },
      }

      const newState = sudokuReducer(state, { type: 'VIEW_SOLVER_STEP', index: 2 })
      const candidatesForCell15 = newState.solver.candidatesForViz?.[15]

      expect(candidatesForCell15?.has(5)).toBe(false)
    })

    it('should handle VIEW_SOLVER_STEP for the initial state (index 0)', () => {
      const state = sudokuReducer(visualizingState, {
        type: 'VIEW_SOLVER_STEP',
        index: 0,
      })

      expect(state.solver.currentStepIndex).toBe(0)
      expect(state.solver.visualizationBoard?.[80].value).toBe(9)
      expect(state.solver.visualizationBoard?.[0].value).toBeNull()
      expect(state.solver.eliminationsForViz).toEqual([])
      expect(state.ui.highlightedValue).toBeNull()
    })

    it('should handle VIEW_SOLVER_STEP for a step with no placements (null highlight)', () => {
      const stepNoPlace: SolvingStep = {
        technique: 'PointingPair',
        placements: [],
        eliminations: [{ index: 10, value: 2 }],
        cause: [],
      }
      const state: SudokuState = {
        ...visualizingState,
        solver: {
          ...visualizingState.solver,
          steps: [stepNoPlace],
        },
      }
      const newState = sudokuReducer(state, { type: 'VIEW_SOLVER_STEP', index: 1 })
      expect(newState.ui.highlightedValue).toBeNull()
    })

    it('should show the final solved board when viewing the last step after backtracking', () => {
      const logicalStep: SolvingStep = {
        technique: 'NakedSingle',
        placements: [{ index: 0, value: 1 }],
        eliminations: [],
        cause: [],
      }
      const backtrackingStep: SolvingStep = {
        technique: 'Backtracking',
        placements: [],
        eliminations: [],
        cause: [],
      }
      const solvedBoard = createEmptyBoard().map((c, i) => ({
        ...c,
        value: (i % 9) + 1,
        candidates: new Set<number>(),
        centers: new Set<number>(),
      }))

      const visualizingStateWithBacktrack: SudokuState = {
        ...visualizingState,
        board: solvedBoard,
        solver: {
          ...visualizingState.solver,
          steps: [logicalStep, backtrackingStep],
        },
      }

      const stateAfterFinalStep = sudokuReducer(visualizingStateWithBacktrack, {
        type: 'VIEW_SOLVER_STEP',
        index: 2,
      })

      // Need to check specific properties as Set equality is strict reference by default
      // or ensure `createEmptyBoard` behavior is consistent.
      // `createEmptyBoard` creates new Sets.
      // `solvedBoard` has new Sets.
      // The reducer creates NEW board structure with new Sets.
      // So we should check contents or structure.
      expect(stateAfterFinalStep.solver.visualizationBoard).toEqual(
        solvedBoard.map((c) => ({ ...c, candidates: new Set(), centers: new Set() })),
      )
    })

    it('should do nothing if not in visualizing mode', () => {
      const state: SudokuState = {
        ...initialState,
        solver: { ...initialState.solver, gameMode: 'playing' },
      }
      const newState = sudokuReducer(state, {
        type: 'VIEW_SOLVER_STEP',
        index: 1,
      })
      expect(newState).toBe(state)
    })

    it('should handle EXIT_VISUALIZATION', () => {
      const solvedState: SudokuState = {
        ...visualizingState,
        solver: { ...visualizingState.solver, isSolved: true },
      }
      const state = sudokuReducer(solvedState, { type: 'EXIT_VISUALIZATION' })
      expect(state.solver.gameMode).toBe('playing')
      expect(state.board).toEqual(initialBoard)
      expect(state.solver.isSolved).toBe(false)
      expect(state.solver.steps).toEqual([])
    })
  })

  describe('UI Actions', () => {
    it('should set active cell index and highlighted value', () => {
      let stateWithValue = sudokuReducer(initialState, {
        type: 'SET_CELL_VALUE',
        index: 10,
        value: 7,
      })
      stateWithValue = {
        ...stateWithValue,
        ui: { ...stateWithValue.ui, highlightedValue: null },
      }

      const newState = sudokuReducer(stateWithValue, {
        type: 'SET_ACTIVE_CELL',
        index: 10,
      })
      expect(newState.ui.activeCellIndex).toBe(10)
      expect(newState.ui.highlightedValue).toBe(7)
    })

    it('should set active cell to null and clear highlighted value', () => {
      const stateWithActiveCell: SudokuState = {
        ...initialState,
        ui: { ...initialState.ui, activeCellIndex: 10, highlightedValue: 7 },
      }
      const newState = sudokuReducer(stateWithActiveCell, {
        type: 'SET_ACTIVE_CELL',
        index: null,
      })
      expect(newState.ui.activeCellIndex).toBe(null)
      expect(newState.ui.highlightedValue).toBe(null)
    })

    it('should set input mode', () => {
      const newState = sudokuReducer(initialState, {
        type: 'SET_INPUT_MODE',
        mode: 'candidate',
      })
      expect(newState.ui.inputMode).toBe('candidate')
    })

    it('should clear the last error', () => {
      const stateWithError: SudokuState = {
        ...initialState,
        ui: { ...initialState.ui, lastError: 'Some error' },
      }
      const newState = sudokuReducer(stateWithError, { type: 'CLEAR_ERROR' })
      expect(newState.ui.lastError).toBeNull()
    })

    it('should set the highlighted value', () => {
      const newState = sudokuReducer(initialState, {
        type: 'SET_HIGHLIGHTED_VALUE',
        value: 5,
      })
      expect(newState.ui.highlightedValue).toBe(5)
    })

    it('should increment timer on TICK_TIMER', () => {
      const newState = sudokuReducer(initialState, { type: 'TICK_TIMER' })
      expect(newState.game.timer).toBe(1)
      const newerState = sudokuReducer(newState, { type: 'TICK_TIMER' })
      expect(newerState.game.timer).toBe(2)
    })

    it('should set transient conflicts', () => {
      const conflicts = new Set([1, 2, 3])
      const newState = sudokuReducer(initialState, {
        type: 'SET_TRANSIENT_CONFLICTS',
        indices: conflicts,
      })
      expect(newState.ui.transientConflicts).toBe(conflicts)
    })

    it('should clear transient conflicts', () => {
      const stateWithConflicts: SudokuState = {
        ...initialState,
        ui: { ...initialState.ui, transientConflicts: new Set([1]) },
      }
      const newState = sudokuReducer(stateWithConflicts, { type: 'CLEAR_TRANSIENT_CONFLICTS' })
      expect(newState.ui.transientConflicts).toBeNull()
    })
  })

  describe('Derived State and Side Effects', () => {
    it('should update derived state when board changes', () => {
      let state = sudokuReducer(initialState, {
        type: 'SET_CELL_VALUE',
        index: 0,
        value: 5,
      })
      expect(state.derived.isBoardEmpty).toBe(false)
      expect(state.derived.isBoardFull).toBe(false)
      expect(state.derived.conflicts.size).toBe(0)

      state = sudokuReducer(state, { type: 'SET_CELL_VALUE', index: 1, value: 5 })
      expect(state.derived.conflicts.size).toBe(2)
    })

    it('should reset solveFailed state on any board modifying action', () => {
      let state: SudokuState = {
        ...initialState,
        solver: { ...initialState.solver, solveFailed: true },
      }
      state = sudokuReducer(state, { type: 'SET_CELL_VALUE', index: 0, value: 1 })
      expect(state.solver.solveFailed).toBe(false)
    })
  })

  describe('Default Case', () => {
    it('should return the same state for an unknown action', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const unknownAction = { type: 'UNKNOWN_ACTION' } as any
      const newState = sudokuReducer(initialState, unknownAction)
      expect(newState).toBe(initialState)
    })
  })
})

describe('loadInitialState', () => {
  const localStorageMock = (() => {
    let store: Record<string, string> = {}
    return {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value.toString()
      }),
      clear: vi.fn(() => {
        store = {}
      }),
      removeItem: vi.fn(),
      length: 0,
      key: vi.fn(),
    }
  })()

  beforeEach(() => {
    localStorageMock.clear()
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(localStorageMock)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return initial state if localStorage is empty', () => {
    localStorageMock.getItem.mockReturnValue(null)
    const state = loadInitialState()
    expect(state).toEqual(initialState)
  })

  it('should load state from new split keys', () => {
    const persistedGame: PersistedGameState = {
      history: { stack: [createEmptyBoard()], index: 0 },
      initialBoard: createEmptyBoard(),
      solution: null,
    }
    const persistedMetrics: PersistedMetrics = { timer: 123, mistakes: 2 }
    const persistedPool: PersistedPool = {
      puzzlePool: { easy: [], medium: [], hard: [], extreme: [] },
      poolRequestCount: { easy: 0, medium: 0, hard: 0, extreme: 0 },
    }

    localStorageMock.getItem.mockImplementation((key) => {
      if (key === STORAGE_KEYS.GAME) return JSON.stringify(persistedGame)
      if (key === STORAGE_KEYS.METRICS) return JSON.stringify(persistedMetrics)
      if (key === STORAGE_KEYS.POOL) return JSON.stringify(persistedPool)
      return null
    })

    const state = loadInitialState()
    expect(state.game.timer).toBe(123)
    expect(state.game.mistakes).toBe(2)
    expect(state.history.stack).toHaveLength(1)
  })

  it('should load puzzle pool from local storage (split key)', () => {
    const pool: PersistedPool = {
      puzzlePool: {
        easy: [{ puzzleString: 'abc', solutionString: 'def' }],
        medium: [],
        hard: [],
        extreme: [],
      },
      poolRequestCount: { easy: 0, medium: 0, hard: 0, extreme: 0 },
    }
    // Correctly mock implementation to only return pool data for the POOL key
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === STORAGE_KEYS.POOL) return JSON.stringify(pool)
      return null
    })

    const state = loadInitialState()
    expect(state.puzzlePool.easy.length).toBe(1)
    expect(state.puzzlePool.easy[0].puzzleString).toBe('abc')
  })

  it('should correctly revive Set objects from local storage', () => {
    // Manually construct the serialized format for a Set
    // We mock the structure that the `replacer` in persistence would output
    const serializedCandidates = { __dataType: 'Set', value: [1, 5, 9] }
    const serializedCenters = { __dataType: 'Set', value: [2, 4] }

    // Use 'any' to bypass TS check for 'Set' type on candidates/centers during mock creation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawCell: any = {
      value: null,
      isGiven: false,
      candidates: serializedCandidates,
      centers: serializedCenters,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const emptyCell: any = {
      value: null,
      isGiven: false,
      candidates: { __dataType: 'Set', value: [] },
      centers: { __dataType: 'Set', value: [] },
    }

    const rawBoard = [rawCell, ...new Array(80).fill(emptyCell)]

    const savedGame: PersistedGameState = {
      history: { stack: [rawBoard], index: 0 },
      initialBoard: createEmptyBoard(),
      solution: null,
    }

    localStorageMock.getItem.mockImplementation((key) => {
      if (key === STORAGE_KEYS.GAME) return JSON.stringify(savedGame)
      return null
    })

    const state = loadInitialState()

    const cell0 = state.board[0]

    // Candidates
    expect(cell0.candidates).toBeInstanceOf(Set)
    expect(cell0.candidates.has(1)).toBe(true)
    expect(cell0.candidates.has(5)).toBe(true)
    expect(cell0.candidates.has(9)).toBe(true)
    expect(cell0.candidates.size).toBe(3)

    // Centers
    expect(cell0.centers).toBeInstanceOf(Set)
    expect(cell0.centers.has(2)).toBe(true)
    expect(cell0.centers.has(4)).toBe(true)
    expect(cell0.centers.size).toBe(2)
  })

  it('should handle JSON parsing errors gracefully', () => {
    localStorageMock.getItem.mockReturnValue('not json')
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const state = loadInitialState()
    expect(state).toEqual(initialState)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to load game state from local storage:',
      expect.any(Error),
    )
    consoleErrorSpy.mockRestore()
  })

  it('should return initial state if game state is malformed', () => {
    const malformedGame = {
      history: { index: 0 }, // Missing stack
    }

    localStorageMock.getItem.mockImplementation((key) => {
      if (key === STORAGE_KEYS.GAME) return JSON.stringify(malformedGame)
      return null
    })

    const state = loadInitialState()
    expect(state).toEqual(initialState)
  })

  it('should default initialBoard to empty if missing in persisted game state', () => {
    const persistedGame = {
      history: { stack: [createEmptyBoard()], index: 0 },
      solution: null,
      // initialBoard missing
    }

    localStorageMock.getItem.mockImplementation((key) => {
      if (key === STORAGE_KEYS.GAME) return JSON.stringify(persistedGame)
      return null
    })

    const state = loadInitialState()
    expect(state.initialBoard).toEqual(createEmptyBoard())
    expect(state.solver.gameMode).toBe('playing')
  })

  it('should reset poolRequestCount to 0 on load even if persisted', () => {
    const persistedPool: PersistedPool = {
      puzzlePool: { easy: [], medium: [], hard: [], extreme: [] },
      poolRequestCount: { easy: 5, medium: 2, hard: 0, extreme: 0 }, // Persisted dirty state
    }

    localStorageMock.getItem.mockImplementation((key) => {
      if (key === STORAGE_KEYS.POOL) return JSON.stringify(persistedPool)
      return null
    })

    const state = loadInitialState()
    // Should be reset to 0
    expect(state.poolRequestCount.easy).toBe(0)
    expect(state.poolRequestCount.medium).toBe(0)
  })
})
