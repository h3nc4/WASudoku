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

import { memo, useCallback, useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

/** How marks that change in this render move: a player toggle fades, a placement strikes. */
export type MarkMotion = 'toggle' | 'strike'

interface SudokuPencilMarksProps {
  readonly candidates: ReadonlySet<number>
  readonly centers: ReadonlySet<number>
  /** A set of candidates to be rendered with a "strike-through" style. */
  readonly eliminations?: ReadonlySet<number>
  /** Omitted for bulk changes such as undo or a new puzzle, which snap. */
  readonly motion?: MarkMotion
}

type Leaving = ReadonlyMap<number, MarkMotion>

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const NONE: Leaving = new Map()
const LEAVING_CLASS: Record<MarkMotion, string> = { toggle: 'note-out', strike: 'note-struck' }
/** Outlasts the 160ms strike, so a mark whose animationend never fires still leaves. */
export const LEAVE_FALLBACK_MS = 200

const sameMarks = (a: ReadonlySet<number>, b: ReadonlySet<number>) =>
  a.size === b.size && [...a].every((n) => b.has(n))

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Keeps marks that just left on screen for one animation, outside the reducer and its history.
 * Under reduced motion they leave at once.
 */
function useLeavingMarks(marks: ReadonlySet<number>, motion: MarkMotion | undefined) {
  const [prev, setPrev] = useState(marks)
  const [leaving, setLeaving] = useState(NONE)

  if (marks !== prev && !sameMarks(marks, prev)) {
    setPrev(marks)
    const next = new Map([...leaving].filter(([n]) => !marks.has(n)))
    if (motion && !prefersReducedMotion()) {
      prev.forEach((n) => marks.has(n) || next.set(n, motion))
    }
    if (next.size !== leaving.size || next.size > 0) setLeaving(next.size > 0 ? next : NONE)
  }

  useEffect(() => {
    if (leaving.size === 0) return
    const id = setTimeout(() => setLeaving(NONE), LEAVE_FALLBACK_MS)
    return () => clearTimeout(id)
  }, [leaving])

  const drop = useCallback((n: number) => {
    setLeaving((current) => {
      if (!current.has(n)) return current
      const next = new Map(current)
      next.delete(n)
      return next.size > 0 ? next : NONE
    })
  }, [])

  return [leaving, drop] as const
}

/**
 * Renders the candidate (corner) or center pencil marks within a Sudoku cell.
 * During visualization, it can also render eliminated candidates.
 */
export const PencilMarks = memo(function PencilMarks({
  candidates,
  centers,
  eliminations,
  motion,
}: SudokuPencilMarksProps) {
  const [leavingCandidates, dropCandidate] = useLeavingMarks(candidates, motion)
  const [leavingCenters, dropCenter] = useLeavingMarks(centers, motion)

  const baseClasses = cn('text-note voice-pencil font-medium', motion === 'toggle' && 'note-in')

  if (centers.size > 0 || leavingCenters.size > 0) {
    const shown = [...new Set([...centers, ...leavingCenters.keys()])].sort((a, b) => a - b)
    const fontSize =
      shown.length > 4 ? 'text-[0.65rem] md:text-xs' : 'text-[0.8rem] md:text-[0.85rem]'
    return (
      <div className="flex size-full items-center justify-center p-1">
        {shown.map((num) => {
          const leaving = leavingCenters.get(num)
          return (
            <span
              key={`center-${num}`}
              aria-hidden={leaving ? true : undefined}
              onAnimationEnd={leaving ? () => dropCenter(num) : undefined}
              className={cn(
                baseClasses,
                fontSize,
                'leading-none',
                leaving && LEAVING_CLASS[leaving],
              )}
            >
              {num}
            </span>
          )
        })}
      </div>
    )
  }

  if (candidates.size > 0 || leavingCandidates.size > 0) {
    return (
      <div className="grid size-full grid-cols-3 grid-rows-3 p-0.5">
        {NUMBERS.map((num) => {
          const leaving = candidates.has(num) ? undefined : leavingCandidates.get(num)
          return (
            <div
              key={`candidate-${num}`}
              className="flex items-center justify-center text-[0.7rem] leading-none md:text-[0.75rem]"
            >
              {candidates.has(num) || leaving ? (
                <span
                  aria-hidden={leaving ? true : undefined}
                  onAnimationEnd={leaving ? () => dropCandidate(num) : undefined}
                  className={cn(
                    baseClasses,
                    leaving && LEAVING_CLASS[leaving],
                    eliminations?.has(num) &&
                      'text-note/55 decoration-solver line-through decoration-2',
                  )}
                >
                  {num}
                </span>
              ) : (
                ''
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return null
})
