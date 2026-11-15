/*
 * Copyright (C) 2026  Henrique Almeida
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

import type { Technique } from '../core/game/steps'

/** How a technique works, in general terms, before the example shows one instance of it. */
export interface Guide {
  /** One sentence, which the page's meta description also uses. */
  readonly summary: string
  readonly paragraphs: readonly string[]
}

export const GUIDES: Readonly<Record<Technique, Guide>> = {
  NakedSingle: {
    summary: 'A Naked Single is a cell with one candidate left, and that digit goes in it.',
    paragraphs: [
      'Every other digit already appears in the row, column or box of the cell. The remaining digit is the only value the cell can take, and the solver places it there.',
      'Placing it also removes that digit from the candidates of every cell that shares a row, column or box with it. Those removals often leave another cell with one candidate. A solve usually runs through long chains of singles for this reason.',
    ],
  },
  HiddenSingle: {
    summary:
      'A Hidden Single is a digit that fits only one cell of a row, column or box, and it goes there.',
    paragraphs: [
      'Every row, column and box must contain each digit once. When a digit is a candidate in only one cell of such a unit, that cell must take it, even if the cell still has other candidates.',
      'The name comes from how the cell looks. Its own candidates say nothing, and the deduction shows only when the unit is read one digit at a time.',
    ],
  },
  NakedPair: {
    summary:
      'A Naked Pair is a pair of cells in one unit with the same two candidates, which then leave the rest of that unit.',
    paragraphs: [
      'When two cells in a row, column or box each have exactly the same two candidates, those cells take both digits between them, in some order.',
      'No other cell in that unit can take either digit, and the solver removes both from the rest of the unit. The step places nothing, but the removals often uncover a Naked or Hidden Single.',
    ],
  },
  NakedTriple: {
    summary:
      'A Naked Triple is a trio of cells in one unit whose candidates together are three digits, which then leave the rest of that unit.',
    paragraphs: [
      'The candidates of three cells in a row, column or box come from the same three digits. A cell does not need all three, so cells with 1 and 2, 2 and 3, and 1 and 3 still form a triple.',
      'Those cells use up the three digits between them. The solver removes the digits from every other cell of the unit.',
    ],
  },
  HiddenPair: {
    summary:
      'A Hidden Pair is a pair of digits found in only the same two cells of a unit, and those cells lose every other candidate.',
    paragraphs: [
      'Within one row, column or box, each of two digits is a candidate in exactly two cells, and they are the same two cells. Neither digit has anywhere else to go in the unit.',
      'Those cells must take the two digits, and the solver removes every other candidate from them. After that the pair is naked and can clear the rest of the unit too.',
    ],
  },
  HiddenTriple: {
    summary:
      'A Hidden Triple is a trio of digits confined to the same three cells of a unit, and those cells lose every other candidate.',
    paragraphs: [
      'Within one row, column or box, three digits appear as candidates only inside the same three cells, though each digit may be missing from one of them.',
      'Those cells must take those digits, and the solver removes every other candidate from them.',
    ],
  },
  PointingPair: {
    summary:
      'A Pointing Pair is a digit confined to two cells of a box on one line, and it leaves the rest of that line.',
    paragraphs: [
      'Inside a box, a digit is a candidate in only two cells, and both cells lie in the same row or the same column. The box needs the digit, and it can only go on that line.',
      'A line takes each digit once. The solver removes the digit from the cells of that row or column outside the box.',
    ],
  },
  PointingTriple: {
    summary:
      'A Pointing Triple is a digit confined to three cells of a box on one line, and it leaves the rest of that line.',
    paragraphs: [
      'This is the Pointing Pair with three cells. A digit is a candidate in exactly three cells of a box, and all of them lie in the same row or column.',
      'Wherever the digit goes in the box, it is on that line. The solver removes it from the cells of the line outside the box.',
    ],
  },
  ClaimingCandidate: {
    summary:
      'Box-Line Reduction removes a digit from the rest of a box when every place for it on a row or column lies inside that box.',
    paragraphs: [
      'This reverses the pointing pattern. Within a row or column, every cell with a digit as a candidate lies inside one box. The line needs the digit, and it can only go in that part of the box.',
      'A box takes each digit once. The solver removes the digit from the cells of the box that are not on that line.',
    ],
  },
  'X-Wing': {
    summary:
      'An X-Wing is a digit confined to the same two columns in two rows, and it leaves the rest of those columns.',
    paragraphs: [
      'In two rows, a digit can go in only two cells each, and those cells fall in the same two columns. They form the corners of a rectangle.',
      'Each row takes the digit once, in different columns. Between them the rows place the digit in both columns, and the solver removes it from every other cell in those columns. The same reasoning works with rows and columns swapped.',
    ],
  },
  Swordfish: {
    summary:
      'A Swordfish is a digit confined to the same three columns across three rows, and it leaves the rest of those columns.',
    paragraphs: [
      'This extends the X-Wing to three lines. In three rows, a digit can go in only two or three cells each, and all of those cells fall within the same three columns.',
      'Between them the rows place the digit once in each of those columns. No other cell in the columns can take it, and the solver removes it there. The same works with rows and columns swapped.',
    ],
  },
  Jellyfish: {
    summary:
      'A Jellyfish is a digit confined to the same four columns across four rows, and it leaves the rest of those columns.',
    paragraphs: [
      'This extends the Swordfish to four lines. In four rows, every cell with the digit as a candidate falls within the same four columns.',
      'Between them the rows place the digit once in each of those columns, and the solver removes it from every other cell there. The same works with rows and columns swapped.',
    ],
  },
  'XY-Wing': {
    summary:
      'An XY-Wing is a pivot and two pincers, each with two candidates, that remove a digit from every cell seeing both pincers.',
    paragraphs: [
      'The pivot has candidates X and Y. One pincer shares a unit with the pivot and has X and Z. The other pincer also shares a unit with the pivot and has Y and Z.',
      'If the pivot is X, the first pincer must be Z. If the pivot is Y, the second pincer must be Z. Either way one pincer is Z, and any cell that sees both pincers cannot be Z.',
    ],
  },
  'XYZ-Wing': {
    summary:
      'An XYZ-Wing is a pivot with three candidates and two pincers that remove their shared digit from cells seeing all three.',
    paragraphs: [
      'The pivot has X, Y and Z. Each pincer shares a unit with the pivot and has two of its candidates, X and Z in one and Y and Z in the other. Z is common to all three cells.',
      'Whatever the pivot takes, one of the three cells ends up as Z. A cell that sees the pivot and both pincers cannot be Z, and the solver removes it there.',
    ],
  },
  'W-Wing': {
    summary:
      'A W-Wing joins a pair of cells with the same two candidates through a strong link, and removes one digit from cells seeing both.',
    paragraphs: [
      'The cells do not share a unit, and both have only X and Y as candidates. Somewhere else a row, column or box has Y in exactly two cells, a strong link, and each end of it sees one of the cells.',
      'If neither cell were X, both would be Y. Neither end of the link could then be Y, and its unit would lack that digit. So at least one of the cells is X, and the solver removes X from every cell that sees both.',
    ],
  },
  Skyscraper: {
    summary:
      'A Skyscraper is a pair of rows with a digit in only two cells each, aligned at one end, and it clears that digit from cells seeing both other ends.',
    paragraphs: [
      'In two rows, a digit can go in only two cells each. One cell of each row lies in the same column and forms the base. The other cells, the roof, lie in different columns.',
      'The base cells share a column, and at most one of them is the digit. In at least one row the digit is on the roof, and any cell that sees both roof cells cannot take it. The same works with rows and columns swapped.',
    ],
  },
  TwoStringKite: {
    summary:
      'A Two-String Kite is a row and a column with a digit in only two cells each, joined in one box, and it clears that digit where the far ends meet.',
    paragraphs: [
      'A row has a digit in exactly two cells, and so does a column. One end of the row and one end of the column are different cells in the same box.',
      'Those ends share a box, and at most one of them is the digit. The far end of the row or the far end of the column must take it, and a cell that sees both far ends cannot.',
    ],
  },
  UniqueRectangleType1: {
    summary:
      'A Unique Rectangle Type 1 removes two digits from one corner of a rectangle that would otherwise give the puzzle two solutions.',
    paragraphs: [
      'The rectangle is made of empty cells on two rows and two columns, spread over exactly two boxes. The candidates of three corners are the same two digits, and the fourth corner has those digits and more.',
      'If the fourth corner also took one of the two digits, the digits could swap around the rectangle and the puzzle would have two solutions. A proper puzzle has one, and the solver removes both digits from the fourth corner. This relies on the puzzle having a unique solution, which every puzzle WASudoku generates has.',
    ],
  },
  Backtracking: {
    summary:
      'When logic runs out, WASudoku finishes the board with a backtracking search and marks that point in the walkthrough.',
    paragraphs: [
      'Backtracking is a search that the solver turns to when none of the techniques finds a step. It places a trial digit in the empty cell with the fewest candidates and follows the consequences until the board is full or a cell runs out of candidates.',
      'On a contradiction the search undoes its last guess and tries the next digit. The walkthrough shows the search as one final Backtracking step after the last logical one, and that step fills every remaining cell from the solution.',
    ],
  },
}
