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

import type { Hint, SolvingStep } from '@/context/sudoku.types'

import { formatCell } from './utils'

const TECHNIQUE_NAMES: Record<string, string> = {
  NakedSingle: 'Naked Single',
  HiddenSingle: 'Hidden Single',
  NakedPair: 'Naked Pair',
  HiddenPair: 'Hidden Pair',
  NakedTriple: 'Naked Triple',
  HiddenTriple: 'Hidden Triple',
  PointingPair: 'Pointing Pair',
  PointingTriple: 'Pointing Triple',
  ClaimingCandidate: 'Box-Line Reduction',
  'X-Wing': 'X-Wing',
  Swordfish: 'Swordfish',
  Jellyfish: 'Jellyfish',
  'XY-Wing': 'XY-Wing',
  'XYZ-Wing': 'XYZ-Wing',
  'W-Wing': 'W-Wing',
  Skyscraper: 'Skyscraper',
  TwoStringKite: 'Two-String Kite',
  UniqueRectangleType1: 'Unique Rectangle Type 1',
  Backtracking: 'Backtracking',
}

/** Human name of a solver technique id. Unknown ids are split at their capitals. */
export function getTechniqueName(technique: string): string {
  return TECHNIQUE_NAMES[technique] ?? technique.replaceAll(/([a-z])([A-Z0-9])/g, '$1 $2')
}

const formatNums = (nums: number[]) => `{${[...nums].sort((a, b) => a - b).join(', ')}}`
const formatCells = (indices: number[]) => indices.map(formatCell).join(', ')
const rowOf = (index: number) => Math.floor(index / 9)
const colOf = (index: number) => index % 9
const boxOf = (index: number) => Math.floor(rowOf(index) / 3) * 3 + Math.floor(colOf(index) / 3)

/** Names the row or column shared by every cell, falling back to the row of the first. */
const describeLine = (indices: number[]): string => {
  const sameCol = indices.every((i) => colOf(i) === colOf(indices[0]))
  const sameRow = indices.every((i) => rowOf(i) === rowOf(indices[0]))
  if (sameCol && !sameRow) return `column ${colOf(indices[0]) + 1}`
  return `row ${rowOf(indices[0]) + 1}`
}

/** Explains the logic of a solving step in plain sentences. */
export function getStepExplanation(step: SolvingStep): string {
  const { technique, placements, cause } = step
  const causeCells = cause.map((c) => c.index)

  switch (technique) {
    case 'NakedSingle': {
      const { index, value } = placements[0]
      return `Cell ${formatCell(index)} has only one possible candidate left, ${value}.`
    }
    case 'HiddenSingle': {
      const { index, value } = placements[0]
      return `Within its row, column or box, the number ${value} fits only in cell ${formatCell(index)}.`
    }
    case 'NakedPair':
    case 'NakedTriple': {
      const candidates = formatNums(cause[0].candidates)
      return `Cells ${formatCells(causeCells)} can only contain the candidates ${candidates}. So these candidates are removed from the other cells in the same unit.`
    }
    case 'HiddenPair':
    case 'HiddenTriple': {
      const candidates = formatNums(cause[0].candidates)
      return `In their shared unit, the candidates ${candidates} only appear in cells ${formatCells(causeCells)}. So every other candidate is removed from these cells.`
    }
    case 'PointingPair':
    case 'PointingTriple': {
      const candidate = cause[0].candidates[0]
      const line = describeLine(causeCells)
      return `In box ${boxOf(causeCells[0]) + 1}, the candidate ${candidate} only appears in ${formatCells(causeCells)}, which all lie in ${line}. So ${candidate} is removed from the rest of ${line}.`
    }
    case 'ClaimingCandidate': {
      const candidate = cause[0].candidates[0]
      const line = describeLine(causeCells)
      return `In ${line}, the candidate ${candidate} only appears in ${formatCells(causeCells)}, which all lie in box ${boxOf(causeCells[0]) + 1}. So ${candidate} is removed from the rest of that box.`
    }
    case 'X-Wing': {
      const candidate = cause[0].candidates[0]
      return `The candidate ${candidate} appears in only two positions in two rows (or columns), and these positions share the same columns (or rows). This forms a rectangle at ${formatCells(causeCells)}, eliminating ${candidate} from the rest of the covering columns (or rows).`
    }
    case 'Swordfish': {
      const candidate = cause[0].candidates[0]
      return `The candidate ${candidate} appears in only two or three positions in three rows (or columns), and these positions align within three columns (or rows). This eliminates ${candidate} from other cells in those covering lines.`
    }
    case 'Jellyfish': {
      const candidate = cause[0].candidates[0]
      return `The candidate ${candidate} appears in positions across four rows (or columns) that align within four columns (or rows). This eliminates ${candidate} from the rest of the covering lines.`
    }
    case 'XY-Wing': {
      const [pivot, pincer1, pincer2] = causeCells.map(formatCell)
      const eliminationVal = step.eliminations[0].value
      return `Pivot ${pivot} and pincers ${pincer1}, ${pincer2} form a Y-Wing pattern. Whatever value the pivot takes, one of the pincers must be ${eliminationVal}. So ${eliminationVal} can be removed from any cell seen by both pincers.`
    }
    case 'XYZ-Wing': {
      const [pivot, pincer1, pincer2] = causeCells.map(formatCell)
      const eliminationVal = step.eliminations[0].value
      return `Pivot ${pivot} and pincers ${pincer1}, ${pincer2} form a bent triple. The pivot has 3 candidates and the pincers have 2, with ${eliminationVal} common to all three. Any cell seeing all three can no longer be ${eliminationVal}.`
    }
    case 'Skyscraper': {
      const candidate = cause[0].candidates[0]
      return `Two rows (or columns) have the candidate ${candidate} in only two positions. One end of each line aligns in the same column (or row). The other two ends, the "roof", eliminate ${candidate} from any cell that sees both of them.`
    }
    case 'TwoStringKite': {
      const candidate = cause[0].candidates[0]
      return `A row and a column each have exactly two positions for candidate ${candidate}. One end of the row and one end of the column meet inside the same box. So ${candidate} must be in one of the outer ends, eliminating it from their intersection.`
    }
    case 'UniqueRectangleType1': {
      const candidates = formatNums(cause[0].candidates)
      const targetCell = formatCell(step.eliminations[0].index)
      return `A "deadly pattern" of candidates ${candidates} spans two boxes. To avoid a puzzle with several solutions, the candidates ${candidates} must be removed from cell ${targetCell}, which holds extra possibilities.`
    }
    case 'W-Wing': {
      const valX = step.eliminations[0].value
      const valB = cause[0].candidates.find((c) => c !== valX) ?? 0
      return `Two cells hold the identical pair {${valX}, ${valB}} but do not see each other. A strong link on ${valB} connects them, which forces one of the two cells to be ${valX}. So ${valX} is removed from any cell that sees both.`
    }
    case 'Backtracking':
      return 'The available logical techniques were not enough to solve the puzzle. A backtracking (brute-force) search found the solution.'
    default:
      return `Technique used: ${getTechniqueName(technique)}.`
  }
}

/** Explains a hint without revealing more than the hint itself. */
export function getHintExplanation(hint: Hint): string {
  switch (hint.kind) {
    case 'mistake':
      return `Cell ${formatCell(hint.index)} does not match the solution. Erase it before looking further.`
    case 'reveal':
      return `No logical technique applies here. Cell ${formatCell(hint.index)} is ${hint.value}.`
    case 'step':
      return getStepExplanation(hint.step)
  }
}
