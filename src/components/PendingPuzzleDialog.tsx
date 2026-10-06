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

import { useSudokuState } from '@/context/sudoku.hooks'
import { useSudokuActions } from '@/hooks/useSudokuActions'

import { ConfirmDialog } from './ConfirmDialog'

/** Asks before starting a puzzle that arrived through a shared link or a paste. */
export function PendingPuzzleDialog() {
  const { ui, solver } = useSudokuState()
  const { loadPuzzle, dismissPuzzle } = useSudokuActions()

  const puzzle = ui.pendingPuzzle
  const replacesGame = solver.gameMode !== 'selecting'

  return (
    <ConfirmDialog
      open={puzzle !== null}
      onOpenChange={(open) => {
        if (!open) dismissPuzzle()
      }}
      title="Start this puzzle?"
      description={
        replacesGame
          ? 'A puzzle was shared with WASudoku. Starting it replaces the current board.'
          : 'A puzzle was shared with WASudoku. It is checked for a unique solution before play starts.'
      }
      confirmLabel="Start puzzle"
      cancelLabel="Not now"
      onConfirm={() => {
        if (puzzle !== null) loadPuzzle(puzzle)
      }}
    />
  )
}
