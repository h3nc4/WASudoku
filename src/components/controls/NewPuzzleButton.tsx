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

import { Edit3, Loader2, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSudokuState } from '@/context/sudoku.hooks'
import { isBusy } from '@/context/sudoku.selectors'
import { useSudokuActions } from '@/hooks/useSudokuActions'
import { areBoardsEqual, DIFFICULTY_LEVELS } from '@/lib/utils'

import { ConfirmDialog } from '../ConfirmDialog'

type PendingChoice = { kind: 'generate'; difficulty: string } | { kind: 'custom' }

/**
 * A button with a dropdown menu to generate a new Sudoku puzzle.
 * It shows a loading state while the puzzle is being generated in a web worker.
 */
export function NewPuzzleButton() {
  const state = useSudokuState()
  const { solver, board, initialBoard, derived } = state
  const { generatePuzzle, startCustomPuzzle } = useSudokuActions()

  const [isShowingGeneratingState, setIsShowingGeneratingState] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [pending, setPending] = useState<PendingChoice | null>(null)

  const isButtonDisabled = isBusy(state)

  const hasProgress =
    (solver.gameMode === 'customInput' && !derived.isBoardEmpty) ||
    (solver.gameMode === 'visualizing' && !areBoardsEqual(board, initialBoard)) ||
    (solver.gameMode === 'playing' && !solver.isSolved && !areBoardsEqual(board, initialBoard))

  const runChoice = (choice: PendingChoice) => {
    if (choice.kind === 'generate') {
      generatePuzzle(choice.difficulty)
    } else {
      startCustomPuzzle()
    }
  }

  const handleChoice = (choice: PendingChoice) => {
    if (hasProgress) {
      setPending(choice)
    } else {
      runChoice(choice)
    }
  }

  const handleSelectDifficulty = (difficulty: string) => {
    handleChoice({ kind: 'generate', difficulty: difficulty.toLowerCase() })
  }

  // Effect to manage the "Generating..." label with a delay,
  // preventing a jarring flash of text for very fast generations.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    if (solver.isGenerating) {
      timer = setTimeout(() => {
        setIsShowingGeneratingState(true)
      }, 300)
    }

    return () => {
      if (timer) {
        clearTimeout(timer)
      }
      setIsShowingGeneratingState(false)
    }
  }, [solver.isGenerating])

  if (isShowingGeneratingState) {
    return (
      <Button disabled className="flex-1">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Generating...
      </Button>
    )
  }

  return (
    <>
      {/* Non-modal, so the confirmation dialog opened from an item keeps pointer events. */}
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            // Start Puzzle is the primary action while a custom board is entered.
            variant={solver.gameMode === 'customInput' ? 'outline' : 'default'}
            className="flex-1"
            disabled={isButtonDisabled}
            onClick={() => setIsOpen(true)}
            onPointerDown={(e) => e.preventDefault()}
          >
            <Wand2 className="mr-2 size-4" />
            New Puzzle
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {DIFFICULTY_LEVELS.map((level) => (
            <DropdownMenuItem key={level} onSelect={() => handleSelectDifficulty(level)}>
              {level}
            </DropdownMenuItem>
          ))}
          {solver.gameMode !== 'selecting' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => handleChoice({ kind: 'custom' })}>
                <Edit3 className="mr-2 size-4" />
                Custom
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title="Abandon current game?"
        description="The board in progress is replaced and cannot be restored."
        confirmLabel={pending?.kind === 'custom' ? 'Create puzzle' : 'Start new puzzle'}
        onConfirm={() => {
          if (pending) runChoice(pending)
        }}
        destructive
      />
    </>
  )
}
