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

import { Edit3 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useSudokuActions } from '@/hooks/useSudokuActions'

import { DifficultyPicker } from './DifficultyPicker'

/**
 * An overlay screen shown on application start, allowing the user to
 * choose a puzzle difficulty or create their own.
 */
export function SelectionScreen() {
  const { generatePuzzle, startCustomPuzzle } = useSudokuActions()

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="bg-card text-card-foreground flex w-full max-w-xl flex-col gap-4 rounded-md border p-6 shadow-[0_24px_60px_-16px_rgb(0_0_0/0.35)] sm:p-8">
        <h2 className="voice-ink text-ink text-center text-2xl tracking-tight">
          Welcome to WASudoku
        </h2>
        <p className="text-muted-foreground text-center text-sm">Pick a difficulty to start.</p>
        <DifficultyPicker onSelect={generatePuzzle} />
        <Button onClick={startCustomPuzzle} variant="secondary">
          <Edit3 className="mr-2 size-4" />
          Create Your Own
        </Button>
      </div>
    </div>
  )
}
