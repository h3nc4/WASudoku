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

import { Link, Share2, Type } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSudokuState } from '@/context/sudoku.hooks'
import { useSudokuActions } from '@/hooks/useSudokuActions'

/** Header menu that copies the puzzle as a link or as an 81-character string. */
export function ShareMenu() {
  const { board, initialBoard, solver } = useSudokuState()
  const { sharePuzzleLink, exportBoard } = useSudokuActions()
  // A link shares the puzzle without the player's progress.
  const puzzle = solver.gameMode === 'customInput' ? board : initialBoard

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="Share puzzle" aria-label="Share puzzle">
          <Share2 className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => sharePuzzleLink(puzzle)}>
          <Link />
          Copy puzzle link
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => exportBoard(board)}>
          <Type />
          Copy board as text
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
