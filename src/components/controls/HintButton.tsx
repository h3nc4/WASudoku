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

import { Lightbulb, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useSudokuState } from '@/context/sudoku.hooks'
import { canRequestHint } from '@/context/sudoku.selectors'
import { useSudokuActions } from '@/hooks/useSudokuActions'

/** Shows the next logical step on the player's board without solving the rest. */
export function HintButton() {
  const state = useSudokuState()
  const { solver } = state
  const { requestHint } = useSudokuActions()

  const isDisabled = !canRequestHint(state)

  return (
    <Button
      variant="secondary"
      size="lg"
      className="flex-1"
      onClick={requestHint}
      disabled={isDisabled}
      title="Show the next logical step"
      onMouseDown={(e) => e.preventDefault()}
    >
      {solver.isHinting ? (
        <Loader2 className="mr-2 size-4 animate-spin" />
      ) : (
        <Lightbulb className="mr-2 size-4" />
      )}
      Hint
    </Button>
  )
}
