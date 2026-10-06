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

import { useEffect } from 'react'

import { useSudokuState } from '@/context/sudoku.hooks'

import { useSudokuActions } from './useSudokuActions'

/** Page-wide shortcuts: undo and redo while editing, arrows while stepping a solution. */
export function useKeyboardShortcuts() {
  const { solver, ui } = useSudokuState()
  const { undo, redo, stepVisualization } = useSudokuActions()

  useEffect(() => {
    const isEditing =
      (solver.gameMode === 'playing' || solver.gameMode === 'customInput') &&
      !solver.isSolving &&
      !ui.isPaused

    const handleKeyDown = (e: KeyboardEvent) => {
      // Keys go to an open dialog first.
      if (document.querySelector('[role="dialog"]')) return

      const key = e.key.toLowerCase()
      if (e.ctrlKey || e.metaKey) {
        if (!isEditing || e.altKey) return
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault()
          undo()
        } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
          e.preventDefault()
          redo()
        }
        return
      }

      if (solver.gameMode === 'visualizing' && !e.altKey && !e.shiftKey) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          stepVisualization(-1)
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          stepVisualization(1)
        }
      }
    }

    globalThis.addEventListener('keydown', handleKeyDown)
    return () => globalThis.removeEventListener('keydown', handleKeyDown)
  }, [solver.gameMode, solver.isSolving, ui.isPaused, undo, redo, stepVisualization])
}
