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

import { offerPuzzle } from '@/context/sudoku.actions'
import type { SudokuAction } from '@/context/sudoku.actions.types'
import { readSharedPuzzle, stripSharedPuzzle } from '@/lib/share'

/** Offers a linked puzzle once on startup, then drops it from the address for reloads. */
export function useSharedPuzzleLink(dispatch: Dispatch<SudokuAction>) {
  useEffect(() => {
    const puzzle = readSharedPuzzle(globalThis.location.search)
    if (puzzle === null) return

    dispatch(offerPuzzle(puzzle))
    globalThis.history.replaceState(
      globalThis.history.state,
      '',
      stripSharedPuzzle(globalThis.location.href),
    )
  }, [dispatch])
}
