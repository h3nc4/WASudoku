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

import type { Dispatch } from 'react'
import { vi } from 'vitest'

import type { SudokuAction } from '@/context/sudoku.actions.types'
import { useSudokuDispatch, useSudokuState } from '@/context/sudoku.hooks'
import { initialState } from '@/context/sudoku.reducer'
import type { SudokuState } from '@/context/sudoku.types'
import { useSudokuActions } from '@/hooks/useSudokuActions'

type Slice = 'history' | 'ui' | 'solver' | 'derived' | 'game'

/** A state override where each slice is itself partial. */
export type StatePatch = {
  [K in keyof SudokuState]?: K extends Slice ? Partial<SudokuState[K]> : SudokuState[K]
}

export type SudokuActions = ReturnType<typeof useSudokuActions>

/** Builds a state from base with patch merged one level into each slice. */
export function makeState(patch: StatePatch = {}, base: SudokuState = initialState): SudokuState {
  // A hook comparing slices by reference must not see a change in a slice nobody patched.
  const merge = <K extends Slice>(key: K): SudokuState[K] =>
    patch[key] ? { ...base[key], ...patch[key] } : base[key]
  return {
    ...base,
    ...patch,
    history: merge('history'),
    ui: merge('ui'),
    solver: merge('solver'),
    derived: merge('derived'),
    game: merge('game'),
  }
}

interface MockSudokuOptions {
  state?: SudokuState
  dispatch?: Dispatch<SudokuAction>
  actions?: Partial<SudokuActions>
}

/** Points the mocked sudoku hooks at these values and leaves an omitted hook as it was. */
export function mockSudoku({ state, dispatch, actions }: MockSudokuOptions) {
  if (state) vi.mocked(useSudokuState).mockReturnValue(state)
  if (dispatch) vi.mocked(useSudokuDispatch).mockReturnValue(dispatch)
  if (actions) vi.mocked(useSudokuActions).mockReturnValue(actions as SudokuActions)
}
