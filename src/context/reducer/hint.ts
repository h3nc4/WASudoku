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

import { parseSolution } from '@/lib/board'

import type { HintSuccessAction } from '../sudoku.actions.types'
import { canRequestHint, isWrongValue } from '../sudoku.selectors'
import type { Hint, SudokuState } from '../sudoku.types'

export const handleRequestHint = (state: SudokuState): SudokuState => {
  if (!canRequestHint(state)) {
    return state
  }

  // A wrong digit makes every later deduction unreliable, so point it out first.
  const mistakeIndex = state.board.findIndex((_, i) => isWrongValue(state, i))
  if (mistakeIndex !== -1) {
    return { ...state, ui: { ...state.ui, hint: { kind: 'mistake', index: mistakeIndex } } }
  }

  return {
    ...state,
    solver: { ...state.solver, isHinting: true },
    ui: { ...state.ui, hint: null },
  }
}

export const handleHintSuccess = (state: SudokuState, action: HintSuccessAction): SudokuState => {
  if (!state.solver.isHinting) return state

  const [firstStep] = action.result.steps
  let hint: Hint | null = null
  if (firstStep) {
    hint = { kind: 'step', step: firstStep }
  } else {
    // Logic alone is stuck, so reveal one empty cell from the solution.
    const solution =
      state.solver.solution ??
      (action.result.solution === null ? null : parseSolution(action.result.solution))
    const index = state.board.findIndex((cell) => cell.value === null)
    if (solution && index !== -1) {
      hint = { kind: 'reveal', index, value: solution[index] }
    }
  }

  return {
    ...state,
    solver: { ...state.solver, isHinting: false },
    ui: { ...state.ui, hint, lastError: hint ? null : 'No hint is available for this board.' },
  }
}

export const handleHintFailure = (state: SudokuState): SudokuState => ({
  ...state,
  solver: { ...state.solver, isHinting: false },
  ui: { ...state.ui, lastError: 'No hint is available for this board.' },
})

export const handleClearHint = (state: SudokuState): SudokuState => ({
  ...state,
  ui: { ...state.ui, hint: null },
})
