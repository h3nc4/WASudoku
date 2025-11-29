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

import { useEffect, type Dispatch } from 'react'
import type { SudokuState } from '@/context/sudoku.types'
import type { SudokuAction } from '@/context/sudoku.actions.types'
import { tickTimer } from '@/context/sudoku.actions'

/**
 * Manages the game timer interval. It ticks only when the game is in 'playing' mode
 * and not yet solved.
 *
 * @param state The current Sudoku state.
 * @param dispatch The dispatch function.
 */
export function useGameTimer(state: SudokuState, dispatch: Dispatch<SudokuAction>) {
  const { gameMode, isSolved } = state.solver

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    if (gameMode === 'playing' && !isSolved) {
      interval = setInterval(() => {
        dispatch(tickTimer())
      }, 1000)
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [gameMode, isSolved, dispatch])
}
