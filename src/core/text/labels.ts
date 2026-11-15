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

import type { SolveBlock } from '../game/guards'
import type { Difficulty } from '../pool'
import { formatTime } from './format'
import { EN } from './grammar'

/** The player's name of each difficulty, as the status bar and the win dialog print it. */
export const DIFFICULTY_NAMES: Readonly<Record<Difficulty, string>> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
  extreme: 'Extreme',
}

/** A typed-in or shared puzzle, which has no difficulty. */
export const CUSTOM_NAME = 'Custom'

export const difficultyName = (difficulty: Difficulty | null): string =>
  difficulty === null ? CUSTOM_NAME : DIFFICULTY_NAMES[difficulty]

/** Why Solve is off, or what it does when it is on. */
export const SOLVE_TITLES: Readonly<Record<SolveBlock | 'ready', string>> = {
  conflicts: 'Cannot solve with conflicts.',
  full: 'Board is already full.',
  empty: 'Board is empty.',
  failed: 'Solving failed. Please change the board to try again.',
  ready: 'Reveal the solution with every solving step',
}

export const START_TITLES = { empty: 'Board is empty.', ready: 'Start puzzle' } as const

export const CLEAR_TITLES = {
  playing: 'Clear your progress and reset the puzzle.',
  other: 'Clear all numbers from the board.',
} as const

/** Button labels, the busy ones shown while the request they started runs. */
export const BUTTON_LABELS = {
  newPuzzle: 'New Puzzle',
  generating: 'Generating...',
  solve: 'Solve',
  solving: 'Solving...',
  start: 'Start Puzzle',
  validating: 'Validating...',
} as const

/** The hint strip's tag, and its label where the hint is a cell rather than a technique. */
export const HINT_LABELS = { tag: 'Hint', mistake: 'Check this cell', reveal: 'Reveal' } as const

export const mistakeCount = (mistakes: number): string =>
  `${String(mistakes)} ${EN.plural(mistakes) === 'one' ? 'mistake' : 'mistakes'}`

/** What the win dialog says the game took. */
export const winSummary = (difficulty: Difficulty | null, seconds: number, mistakes: number) =>
  `${difficultyName(difficulty)} puzzle finished in ${formatTime(seconds)} with ${mistakeCount(mistakes)}.`

/** Status region text for a solved puzzle and for each counted mistake. */
export const SOLVED_ANNOUNCEMENT = 'Puzzle solved.'

export const mistakeAnnouncement = (count: number): string => `${mistakeCount(count)} so far.`
