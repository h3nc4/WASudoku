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

import { type Dispatch, useEffect } from 'react'

import { pauseGame, tickTimer } from '@/context/sudoku.actions'
import type { SudokuAction } from '@/context/sudoku.actions.types'
import type { SudokuState } from '@/context/sudoku.types'

/** Ticks the timer during unsolved, unpaused play, and pauses the game when the tab is hidden. */
export function useGameTimer(state: SudokuState, dispatch: Dispatch<SudokuAction>) {
  const { gameMode, isSolved } = state.solver
  const { isPaused } = state.ui

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        dispatch(pauseGame())
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [dispatch])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    if (gameMode === 'playing' && !isSolved && !isPaused) {
      interval = setInterval(() => {
        dispatch(tickTimer())
      }, 1000)
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [gameMode, isSolved, isPaused, dispatch])
}
