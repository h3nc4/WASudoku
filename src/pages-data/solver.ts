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

import { techniqueName } from '../core/text/techniques'
import {
  articleLd,
  type PageLink,
  type PageMeta,
  SITE_NAME,
  SOLVER_PATH,
  techniquePath,
} from './site'
import { FINDERS, type Level, levelOf, techniqueSlug } from './techniques'

/** One technique in solver order. Techniques one finder reports share its position. */
export interface FinderRow extends PageLink {
  readonly position: number
  readonly level: Level | null
}

const BUDGET_BITS = 21
/** The guesses one search may make, as SEARCH_BUDGET in api.rs sets it. */
export const SEARCH_BUDGET = 1 << BUDGET_BITS

export interface Section {
  readonly id: string
  readonly heading: string
  readonly paragraphs: readonly string[]
}

const head = {
  title: `How the solver works - ${SITE_NAME}`,
  description:
    'WASudoku solves a puzzle with human techniques first, in a fixed order, and finishes with a backtracking search only when logic runs out.',
  path: SOLVER_PATH,
}

export const SOLVER_META: PageMeta = {
  ...head,
  type: 'article',
  jsonLd: articleLd('TechArticle', head, 'Sudoku solving'),
}

export const SOLVER_INTRO =
  'WASudoku solves a puzzle the way a person would, one deduction at a time, and every step can be replayed and explained. The solver is written in Rust and compiled to WebAssembly. It runs in a worker thread inside the browser, which keeps every puzzle on the device.'

export const LOGIC: Section = {
  id: 'logic',
  heading: 'Logic first',
  paragraphs: [
    'The solver starts from the puzzle and notes the candidates of each empty cell. A candidate is a digit missing from the row, the column and the box of that cell.',
    'It then runs a list of finders in a fixed order, and takes the step from the first one that finds anything. That step places digits or removes candidates. The solver then starts again from the top of the list, which tries the cheap techniques before the expensive ones.',
    'When no finder has anything to offer, the logical part stops. On most puzzles that happens because the board is full.',
  ],
}

export const ORDER: Section = {
  id: 'techniques',
  heading: 'Technique order',
  paragraphs: [
    'The table lists the finders in the order the solver runs them. The puzzle generator grades each step by its level. Easy puzzles use only Basic steps, Medium puzzles go up to Intermediate and Hard puzzles up to Advanced, while Expert puzzles need at least two Master steps.',
    'The fish finder tries each digit from 1 to 9, and for each digit an X-Wing, then a Swordfish, then a Jellyfish, on rows before columns.',
  ],
}

export const SEARCH: Section = {
  id: 'backtracking',
  heading: 'Then backtracking',
  paragraphs: [
    'Some puzzles stop with empty cells, because no technique on the list applies. Extreme puzzles are generated this way on purpose. The rest of the board then comes from a depth-first search.',
    'The search takes the empty cell with the fewest candidates and places each of its digits there, in ascending order. After each guess it fills in every cell left with one candidate. A cell with no candidates means the guess was wrong, and the search goes back to try the next digit.',
    `Before the logical steps run, a second search counts the solutions, stopping at two. A puzzle with no solution is refused, and when there is exactly one, that solution is the one the walkthrough ends on. Each search gives up after ${SEARCH_BUDGET.toLocaleString('en-US')} guesses, so no board can keep the worker busy for long.`,
    'The walkthrough marks the point where logic stopped with one Backtracking step, which fills every remaining cell at once.',
  ],
}

/** The finder table, each technique linked to its own page. */
export const finderRows = (): FinderRow[] =>
  FINDERS.flatMap(({ techniques }, index) =>
    techniques.map((technique) => ({
      position: index + 1,
      level: levelOf(technique),
      href: techniquePath(techniqueSlug(technique)),
      label: techniqueName(technique),
    })),
  )

export const ALL_TECHNIQUES: PageLink = {
  href: `${SOLVER_PATH}#${ORDER.id}`,
  label: 'All techniques',
}

export const BACKTRACKING_LINK: PageLink = {
  href: techniquePath(techniqueSlug('Backtracking')),
  label: 'Backtracking',
}
