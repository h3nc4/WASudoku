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

import { useCallback, useEffect, useRef } from 'react'

import { saveGame, saveMetrics, savePool, scheduleIdle } from '@/context/sudoku.persistence'
import type { SavedGame, SudokuState } from '@/context/sudoku.types'

/**
 * Persists the Sudoku state to local storage under separate keys.
 * The board history is written when the browser is idle and flushed when the page hides.
 */
export function useSudokuPersistence(state: SudokuState) {
  const pendingGame = useRef<SavedGame | null>(null)
  const cancelScheduled = useRef<(() => void) | null>(null)

  const flushGame = useCallback(() => {
    cancelScheduled.current?.()
    cancelScheduled.current = null
    if (pendingGame.current) {
      saveGame(pendingGame.current)
      pendingGame.current = null
    }
  }, [])

  useEffect(() => {
    const flushIfHidden = () => {
      if (document.visibilityState === 'hidden') flushGame()
    }
    globalThis.addEventListener('pagehide', flushGame)
    document.addEventListener('visibilitychange', flushIfHidden)
    return () => {
      globalThis.removeEventListener('pagehide', flushGame)
      document.removeEventListener('visibilitychange', flushIfHidden)
      flushGame()
    }
  }, [flushGame])

  useEffect(() => {
    pendingGame.current = {
      history: state.history,
      initialBoard: state.initialBoard,
      solution: state.solver.solution,
      difficulty: state.solver.difficulty,
    }
    cancelScheduled.current ??= scheduleIdle(flushGame)
  }, [flushGame, state.history, state.initialBoard, state.solver.solution, state.solver.difficulty])

  // The timer ticks every second, and its payload is two numbers.
  useEffect(() => {
    saveMetrics(state.game)
  }, [state.game])

  useEffect(() => {
    savePool(state.puzzlePool)
  }, [state.puzzlePool])
}
