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

import {
  boardsEqual,
  candidatesAt,
  centersAt,
  clear,
  EMPTY_BOARD,
  isBoardEmpty,
  type MarkKind,
  parseBoard,
  place,
  valueAt,
} from '../board'
import { type CellIndex, type Digit, EMPTY_MASK, hasDigit } from '../digits'
import { type Direction, lookup, neighbour } from '../geometry'
import { redo, undo } from '../history'
import { type Difficulty, type PuzzleData, take } from '../pool'
import { canPlace, fillCandidates, isWrong, peersHolding, toggleNote } from '../rules'
import { type Outcome, stay } from './effects'
import { canUndoRedo, isClockRunning, isGridReadOnly, isLockedGiven } from './guards'
import { commit, FLASH_MS, highlight, request, select, startPlay, withHistory } from './session'
import {
  boardIn,
  editable,
  type EditableGame,
  historyIn,
  INPUT_MODES,
  type InputMode,
  type State,
} from './state'

/** Places a digit, counting a mistake in play when it disagrees with the solution. */
export function placeDigit(
  state: State,
  game: EditableGame,
  index: CellIndex,
  digit: Digit,
): State {
  const board = boardIn(game)
  if (valueAt(board, index) === digit || isLockedGiven(game, index)) return state
  const next = place(board, index, digit)
  const solution = game.mode === 'playing' ? game.play.solution : null
  return commit(state, game, next, solution !== null && isWrong(next, solution, index))
}

function toggleNoteAt(
  state: State,
  game: EditableGame,
  index: CellIndex,
  kind: MarkKind,
  digit: Digit,
): State {
  const board = boardIn(game)
  if (valueAt(board, index) !== null) return state
  // The caller already pulsed a clashing note, so the toggle always changes the board.
  return commit(state, game, toggleNote(board, index, kind, digit))
}

export function eraseAt(state: State, game: EditableGame, index: CellIndex): State {
  const board = boardIn(game)
  if (isLockedGiven(game, index)) return state
  const blank =
    valueAt(board, index) === null &&
    candidatesAt(board, index) === EMPTY_MASK &&
    centersAt(board, index) === EMPTY_MASK
  return blank ? state : commit(state, game, clear(board, index))
}

/** The editable game when the grid takes input, or null. */
export const inputGame = (state: State): EditableGame | null => {
  const game = editable(state.game)
  return game === null || isGridReadOnly(state) ? null : game
}

/** Pulses the peers that refused a note. */
function flash(state: State, cells: readonly CellIndex[]): Outcome {
  const pulse = state.pulses + 1
  return {
    state: { ...state, flash: { cells, pulse }, pulses: pulse },
    effects: [{ kind: 'flash', pulse, delayMs: FLASH_MS }],
  }
}

/** Enters a digit in the selected cell as the input mode says, a clashing note pulsing its peers instead. */
export function inputDigit(state: State, game: EditableGame, digit: Digit): Outcome {
  const index = state.input.selected
  if (index === null || isLockedGiven(game, index)) return stay(state)
  const board = boardIn(game)
  const { mode } = state.input
  if (mode === 'normal') {
    const placed = placeDigit(state, game, index, digit)
    // Typing a puzzle in moves on, but in play the cell just filled keeps the focus.
    const advance = state.game.mode === 'entering' && canPlace(board, index, digit)
    const after = advance ? neighbour(index, 'right') : null
    return stay(after === null ? placed : select(placed, after))
  }
  const marks = mode === 'candidate' ? candidatesAt(board, index) : centersAt(board, index)
  if (!hasDigit(marks, digit)) {
    const clashing = peersHolding(board, index, digit)
    if (clashing.length > 0) return flash(state, clashing)
  }
  return stay(toggleNoteAt(state, game, index, mode, digit))
}

/** A typed digit, which shades that digit once it is in. */
export function onDigit(state: State, digit: Digit): Outcome {
  const game = inputGame(state)
  if (game === null) return stay(state)
  const { state: next, effects } = inputDigit(state, game, digit)
  return { state: highlight(next, digit), effects }
}

/** A pad key outside sticky numbers shades its digit and enters it. */
export function onPadInput(state: State, game: EditableGame, digit: Digit): Outcome {
  return inputDigit(highlight(state, digit), game, digit)
}

export function onErase(state: State, how: 'delete' | 'backspace'): Outcome {
  const index = state.input.selected
  const game = inputGame(state)
  if (index === null || game === null) return stay(state)
  // Clues are never erased, but backspace still moves off one.
  const erased = eraseAt(state, game, index)
  const back = how === 'backspace' ? neighbour(index, 'left') : null
  return stay(back === null ? erased : select(erased, back))
}

export function onMove(state: State, direction: Direction): Outcome {
  const index = state.input.selected
  const next = index === null || isGridReadOnly(state) ? null : neighbour(index, direction)
  return stay(next === null ? state : select(state, next))
}

/** Focus reaching a cell selects it, while focus leaving the grid always deselects. */
export const onSelect = (state: State, index: CellIndex | null): Outcome =>
  stay(index !== null && isGridReadOnly(state) ? state : select(state, index))

export const onSetMode = (state: State, mode: InputMode): Outcome =>
  stay({ ...state, input: { ...state.input, mode } })

export function onCycleMode(state: State): Outcome {
  const at = INPUT_MODES.indexOf(state.input.mode)
  const mode = lookup(INPUT_MODES, (at + 1) % INPUT_MODES.length, 'normal')
  return onSetMode(state, mode)
}

export function onUndoRedo(state: State, direction: 'undo' | 'redo'): Outcome {
  const game = editable(state.game)
  if (game === null || !canUndoRedo(state)) return stay(state)
  const history = historyIn(game)
  const next = direction === 'undo' ? undo(history) : redo(history)
  return stay(next === history ? state : withHistory(state, game, next))
}

/** Play goes back to the puzzle and a typed-in puzzle to an empty board, both as one undoable move. */
export function onClear(state: State): Outcome {
  const game = editable(state.game)
  if (game === null || !canUndoRedo(state)) return stay(state)
  const board = boardIn(game)
  const target = game.mode === 'entering' ? EMPTY_BOARD : game.play.puzzle
  const pristine = game.mode === 'entering' ? isBoardEmpty(board) : boardsEqual(board, target)
  if (pristine) return stay(state)
  const cleared = commit(state, game, target)
  return stay({
    ...cleared,
    input: { ...cleared.input, selected: null, highlight: null },
    flash: null,
  })
}

export function onAutoFill(state: State): Outcome {
  const game = inputGame(state)
  if (game?.mode !== 'playing') return stay(state)
  const board = boardIn(game)
  const filled = fillCandidates(board)
  return stay(boardsEqual(board, filled) ? state : commit(state, game, filled))
}

export function onPause(state: State): Outcome {
  const { game } = state
  if (game.mode !== 'playing' || !isClockRunning(state)) return stay(state)
  return stay({
    ...state,
    game: { ...game, paused: true },
    input: { ...state.input, selected: null, highlight: null },
  })
}

export function onResume(state: State): Outcome {
  const { game } = state
  return stay(
    game.mode === 'playing' && game.paused ? { ...state, game: { ...game, paused: false } } : state,
  )
}

/** A hidden page pauses the game and writes the game and its metrics at once. */
export function onHidden(state: State): Outcome {
  const paused = onPause(state).state
  if (paused.game.mode === 'selecting') return stay(paused)
  return {
    state: paused,
    effects: [
      { kind: 'save', key: 'wasudoku.state.game', when: 'now' },
      { kind: 'save', key: 'wasudoku.state.metrics', when: 'now' },
    ],
  }
}

/** Starts a puzzle from the pool, or asks the generator for one while the current game stays. */
export function onNewGame(state: State, difficulty: Difficulty): Outcome {
  const taken = take(state.pool, difficulty)
  const puzzle = taken === null ? null : parseBoard(taken.puzzle.puzzleString)
  if (taken === null || puzzle === null) {
    return request(state, { task: 'generate', difficulty }, { kind: 'generate', difficulty })
  }
  const solution = parseBoard(taken.puzzle.solutionString)
  return startPlay({ ...state, pool: taken.pool }, puzzle, solution, difficulty)
}

/** A generated puzzle for the request the player waited on, which has already settled. */
export function onGenerated(state: State, difficulty: Difficulty, puzzle: PuzzleData): Outcome {
  const board = parseBoard(puzzle.puzzleString)
  if (board === null) {
    return { state, effects: [{ kind: 'toast', message: 'generateFailed', tone: 'error' }] }
  }
  return startPlay(state, board, parseBoard(puzzle.solutionString), difficulty, [
    { kind: 'toast', message: 'generated', tone: 'success' },
  ])
}
