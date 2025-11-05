/*
 * Copyright (C) 2025  Henrique Almeida
 * This file is part of WASudoku.

 * WASudoku is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.

 * WASudoku is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.

 * You should have received a copy of the GNU Affero General Public License
 * along with WASudoku.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Edit3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NewPuzzleButton } from './controls/NewPuzzleButton'
import { useSudokuActions } from '@/hooks/useSudokuActions'

/**
 * An overlay screen shown on application start, allowing the user to
 * choose a puzzle difficulty or create their own.
 */
export function SelectionScreen() {
  const { startCustomPuzzle } = useSudokuActions()

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center">
      <div className="bg-background/80 flex flex-col gap-4 rounded-lg border p-8 shadow-2xl backdrop-blur-lg">
        <h2 className="text-center text-2xl font-bold">Welcome to WASudoku</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <NewPuzzleButton />
          <Button onClick={startCustomPuzzle} variant="secondary" className="flex-1">
            <Edit3 className="mr-2 size-4" />
            Create Your Own
          </Button>
        </div>
      </div>
    </div>
  )
}
