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

/**
 * Represents the state of a single cell on the Sudoku board.
 * It can hold a definitive value or sets of pencil marks.
 */
export interface CellState {
  readonly value: number | null
  readonly isGiven: boolean
  readonly candidates: ReadonlySet<number>
  readonly centers: ReadonlySet<number>
}

export type BoardState = readonly CellState[]
export type InputMode = 'normal' | 'candidate' | 'center'
export type GameMode = 'selecting' | 'customInput' | 'playing' | 'visualizing'

/** Generator difficulties in the order they are offered, as the WASM generator names them. */
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert', 'extreme'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export interface Placement {
  index: number
  value: number
}

export interface Elimination {
  index: number
  value: number
}

export interface CauseCell {
  index: number
  candidates: number[]
}

/** Technique ids sent by the solver, plus the one the reducer appends after logic runs out. */
export type Technique =
  | 'NakedSingle'
  | 'HiddenSingle'
  | 'NakedPair'
  | 'NakedTriple'
  | 'HiddenPair'
  | 'HiddenTriple'
  | 'PointingPair'
  | 'PointingTriple'
  | 'ClaimingCandidate'
  | 'X-Wing'
  | 'Swordfish'
  | 'Jellyfish'
  | 'XY-Wing'
  | 'XYZ-Wing'
  | 'Skyscraper'
  | 'TwoStringKite'
  | 'UniqueRectangleType1'
  | 'W-Wing'
  | 'Backtracking'

export interface SolvingStep {
  technique: Technique
  placements: Placement[]
  eliminations: Elimination[]
  cause: CauseCell[]
}

export interface SolveResult {
  steps: SolvingStep[]
  solution: string | null
}

/** A hint for the next move on the player's board. */
export type Hint =
  | { readonly kind: 'step'; readonly step: SolvingStep }
  | { readonly kind: 'mistake'; readonly index: number }
  | { readonly kind: 'reveal'; readonly index: number; readonly value: number }

export interface HistoryState {
  readonly stack: readonly BoardState[]
  readonly index: number
}

export interface UiState {
  readonly activeCellIndex: number | null
  readonly highlightedValue: number | null
  readonly inputMode: InputMode
  readonly lastError: string | null
  /** Set of cell indices that are momentarily conflicting with a user action. */
  readonly transientConflicts: ReadonlySet<number> | null
  /** The hint currently shown on the board, if any. */
  readonly hint: Hint | null
  /** Whether the game is paused, which hides the board and stops the timer. */
  readonly isPaused: boolean
  /** A puzzle string waiting for the player to confirm loading it. */
  readonly pendingPuzzle: string | null
}

export interface SolverState {
  readonly isSolving: boolean
  readonly isGenerating: boolean
  readonly isValidating: boolean
  readonly isHinting: boolean
  readonly generationDifficulty: Difficulty | null
  /** Difficulty of the puzzle in play, or null for a custom one. */
  readonly difficulty: Difficulty | null
  readonly isSolved: boolean
  readonly solveFailed: boolean
  readonly gameMode: GameMode
  readonly steps: readonly SolvingStep[]
  readonly currentStepIndex: number | null
  readonly visualizationBoard: BoardState | null
  readonly candidatesForViz: (ReadonlySet<number> | null)[] | null
  readonly eliminationsForViz: readonly Elimination[] | null
  readonly solution: readonly number[] | null
}

export interface DerivedState {
  readonly conflicts: ReadonlySet<number>
  readonly isBoardEmpty: boolean
  readonly isBoardFull: boolean
}

export interface GameMetrics {
  readonly timer: number
  readonly mistakes: number
}

export interface PuzzleData {
  readonly puzzleString: string
  readonly solutionString: string
}

/** The complete state of the Sudoku game. */
export interface SudokuState {
  /** The current state of the 81 Sudoku cells. */
  readonly board: BoardState
  /** The board state as it was when the solver was last initiated. */
  readonly initialBoard: BoardState
  /** A history of board states for undo/redo functionality. */
  readonly history: HistoryState
  /** The current state of the UI. */
  readonly ui: UiState
  /** The current state related to the solver and visualization. */
  readonly solver: SolverState
  /** State that is calculated based on the current board. */
  readonly derived: DerivedState
  /** Metrics for the current game session (time, mistakes). */
  readonly game: GameMetrics
  /** Pool of pre-generated puzzles keyed by difficulty. */
  readonly puzzlePool: Record<Difficulty, PuzzleData[]>
  /** Count of pending generation requests per difficulty. */
  readonly poolRequestCount: Record<Difficulty, number>
}

/** Game session as written to storage, five characters per cell. */
export interface PersistedGame {
  readonly version: 2
  readonly history: { readonly stack: readonly string[]; readonly index: number }
  readonly initialBoard: string
  /** The 81 solution digits as one string. */
  readonly solution: string | null
  readonly difficulty: Difficulty | null
}

/** Game session as decoded from storage. */
export interface SavedGame {
  readonly history: HistoryState
  readonly initialBoard: BoardState
  readonly solution: readonly number[] | null
  readonly difficulty: Difficulty | null
}

/** Data persisted for the puzzle generator pool. */
export interface PersistedPool {
  readonly puzzlePool: Record<Difficulty, PuzzleData[]>
}
