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

import { useEffect } from 'react'
import type {
  SudokuState,
  PersistedGameState,
  PersistedPool,
  BoardState,
} from '@/context/sudoku.types'
import { STORAGE_KEYS } from '@/context/sudoku.reducer'

/**
 * Custom JSON replacer to handle serializing `Set` objects.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function replacer(_key: string, value: any) {
  if (value instanceof Set) {
    return {
      __dataType: 'Set',
      value: [...value],
    }
  }
  return value
}

/**
 * Saves a portion of the game state to local storage.
 * @param key - The localStorage key.
 * @param data - The data object to save.
 */
function saveToStorage<T>(key: string, data: T) {
  try {
    const json = JSON.stringify(data, replacer)
    window.localStorage.setItem(key, json)
  } catch (error) {
    console.error(`Failed to save ${key} to local storage:`, error)
  }
}

/**
 * A hook that listens to specific changes in the Sudoku state and persists them
 * to the browser's local storage using separated keys to improve performance.
 *
 * @param state - The current Sudoku state from the reducer.
 */
export function useSudokuPersistence(state: SudokuState) {
  // 1. Persist Core Game State (Board, History, Initial Board, Solution)
  // This updates only when the board/history changes (user moves).
  useEffect(() => {
    const data: PersistedGameState = {
      history: {
        stack: state.history.stack as BoardState[],
        index: state.history.index,
      },
      initialBoard: state.initialBoard,
      solution: state.solver.solution as number[] | null,
    }
    saveToStorage(STORAGE_KEYS.GAME, data)
  }, [state.history, state.initialBoard, state.solver.solution])

  // 2. Persist Metrics (Timer, Mistakes)
  // This updates every second when the timer ticks. The payload is tiny.
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.METRICS, state.game)
  }, [state.game])

  // 3. Persist Puzzle Pool
  // This updates only when a background generation finishes. The payload is large.
  useEffect(() => {
    const data: PersistedPool = {
      puzzlePool: state.puzzlePool,
      poolRequestCount: state.poolRequestCount,
    }
    saveToStorage(STORAGE_KEYS.POOL, data)
  }, [state.puzzlePool, state.poolRequestCount])
}
