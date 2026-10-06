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

import { cn } from '@/lib/utils'

interface WordmarkProps {
  readonly className?: string
}

/** "WA" speaks in the solver's mono instrument voice, "Sudoku" in printed ink. */
export function Wordmark({ className }: WordmarkProps) {
  return (
    <span
      role="img"
      aria-label="WASudoku"
      className={cn('inline-flex items-baseline font-sans leading-none tracking-tight', className)}
    >
      <span aria-hidden="true" className="voice-mono text-pencil font-medium">
        WA
      </span>
      <span aria-hidden="true" className="voice-ink text-ink">
        Sudoku
      </span>
    </span>
  )
}
