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
  type Board,
  type BoardMove,
  boardsEqual,
  candidatesAt,
  centersAt,
  changedCells,
  EMPTY_BOARD,
  findMove,
  isBoardEmpty,
  isGiven,
  valueAt,
} from '../board'
import { elapsedSeconds } from '../clock'
import { type CellIndex, type Digit, DIGITS, EMPTY_MASK, type Mask, withDigit } from '../digits'
import { boxOf, CELLS, colOf, isPeer, lookup, rowOf, SIZE } from '../geometry'
import type { History } from '../history'
import type { KeyContext } from '../keymap'
import type { Difficulty } from '../pool'
import { completedUnits, conflicts, digitCount } from '../rules'
import {
  canAutoFill,
  canRequestHint,
  canSolve,
  canUndoRedo,
  canValidate,
  isBusy,
  isEditable,
  isGridReadOnly,
  isWrongAt,
  solveBlock,
} from './guards'
import {
  boardOf,
  type Game,
  historyOf,
  type InputMode,
  type Mode,
  playOf,
  type State,
} from './state'
import type { Hint, Step } from './steps'
import { currentStep, walkBoard, walkCandidates } from './walkthrough'

// The ui imports the core only through this module. These parse what it reads off the page.
export { type CellIndex, type Digit, digitsOf, type Mask, toDigit } from '../digits'
export { toCellIndex } from '../geometry'
export { DIFFICULTIES, type Difficulty, isDifficulty } from '../pool'
export type { MessageId, Tone } from './effects'
export type { SolveBlock } from './guards'
export { INPUT_MODES, type InputMode, type Mode, type State } from './state'
export type { CauseCell, CellDigit, Hint, Step, Technique } from './steps'

/** Mistakes the status bar counts against, a limit it shows without enforcing. */
export const MISTAKE_LIMIT = 3

export const selectMode = (state: State): Mode => state.game.mode
export const selectInputMode = (state: State): InputMode => state.input.mode
export const selectSelection = (state: State): CellIndex | null => state.input.selected

/** The board the player edits, or an empty one on the selection screen. The walkthrough draws its own. */
export const selectBoard = (state: State): Board => boardOf(state.game) ?? EMPTY_BOARD

/** Everything one cell draws. Grid-wide facts such as pause sit in `selectGrid`. */
export interface CellView {
  readonly digit: Digit | null
  readonly given: boolean
  readonly candidates: Mask
  readonly centers: Mask
  /** Candidates the current walkthrough step or hint strikes out. */
  readonly eliminated: Mask
  readonly conflict: boolean
  readonly wrong: boolean
  readonly selected: boolean
  /** Shares a unit with the selected cell, or is it. */
  readonly peer: boolean
  /** Holds the shaded digit. */
  readonly sameDigit: boolean
  /** Part of the pattern behind the walkthrough step or the hint. */
  readonly cause: boolean
  /** Filled by the walkthrough step. */
  readonly placed: boolean
  readonly hintTarget: boolean
  /** Refused a note just now, and pulses. */
  readonly flashing: boolean
}

const NO_CELLS: ReadonlySet<CellIndex> = new Set()

const cellsOf = (entries: readonly { readonly index: CellIndex }[]): ReadonlySet<CellIndex> =>
  new Set(entries.map(({ index }) => index))

function struck(entries: readonly { readonly index: CellIndex; readonly digit: Digit }[]): Mask[] {
  const masks = CELLS.map(() => EMPTY_MASK)
  for (const { index, digit } of entries)
    masks[index] = withDigit(lookup(masks, index, EMPTY_MASK), digit)
  return masks
}

/** The cells a hint points at: its pattern, and its placements or else its eliminations. */
function hintCells(hint: Hint | null): {
  cause: ReadonlySet<CellIndex>
  target: ReadonlySet<CellIndex>
} {
  if (hint === null) return { cause: NO_CELLS, target: NO_CELLS }
  if (hint.kind !== 'step') return { cause: NO_CELLS, target: new Set([hint.index]) }
  const { cause, placements, eliminations } = hint.step
  // A placement is the news, and its incidental eliminations are left unmarked.
  return {
    cause: cellsOf(cause),
    target: cellsOf(placements.length > 0 ? placements : eliminations),
  }
}

interface Layer {
  readonly board: Board
  readonly notes: (index: CellIndex) => { candidates: Mask; centers: Mask }
  readonly eliminated: readonly Mask[]
  readonly cause: ReadonlySet<CellIndex>
  readonly placed: ReadonlySet<CellIndex>
  readonly target: ReadonlySet<CellIndex>
}

const ownNotes = (board: Board) => (index: CellIndex) => ({
  candidates: candidatesAt(board, index),
  centers: centersAt(board, index),
})

/** The grid draws a walkthrough position, or the player's board with any hint. */
function layerOf(game: Game): Layer {
  const board = boardOf(game) ?? EMPTY_BOARD
  if (game.mode === 'walkthrough') {
    const step = currentStep(game.walk)
    const candidates = walkCandidates(board, game.walk)
    return {
      board: walkBoard(board, game.walk),
      notes: (index) => ({
        candidates: lookup(candidates, index, EMPTY_MASK),
        centers: EMPTY_MASK,
      }),
      eliminated: struck(step?.eliminations ?? []),
      cause: cellsOf(step?.cause ?? []),
      placed: cellsOf(step?.placements ?? []),
      target: NO_CELLS,
    }
  }
  const hint = game.mode === 'playing' ? game.hint : null
  const { cause, target } = hintCells(hint)
  return {
    board,
    notes: ownNotes(board),
    eliminated: struck(hint?.kind === 'step' ? hint.step.eliminations : []),
    cause,
    placed: NO_CELLS,
    target,
  }
}

const cellCache = new WeakMap<State, readonly CellView[]>()

/** The 81 cell views, built once per state. A walkthrough step rebuilds every cell, as the old grid did. */
export function selectCells(state: State): readonly CellView[] {
  const cached = cellCache.get(state)
  if (cached !== undefined) return cached
  const { game, input, flash } = state
  const layer = layerOf(game)
  const clashing = conflicts(boardOf(game) ?? EMPTY_BOARD)
  const flashing = new Set(flash?.cells ?? [])
  // A won board and the walkthrough don't show the selection.
  const shaded = game.mode !== 'won' && game.mode !== 'walkthrough'
  const { selected, highlight } = input
  const cells = CELLS.map((index): CellView => {
    const digit = valueAt(layer.board, index)
    return {
      digit,
      given: isGiven(layer.board, index),
      ...layer.notes(index),
      eliminated: lookup(layer.eliminated, index, EMPTY_MASK),
      conflict: clashing.has(index),
      wrong: isWrongAt(game, index),
      selected: shaded && selected === index,
      peer: shaded && selected !== null && (selected === index || isPeer(selected, index)),
      sameDigit: shaded && digit !== null && digit === highlight,
      cause: layer.cause.has(index),
      placed: layer.placed.has(index),
      hintTarget: layer.target.has(index),
      flashing: flashing.has(index),
    }
  })
  cellCache.set(state, cells)
  return cells
}

export const selectCell = (state: State, index: CellIndex): CellView | undefined =>
  selectCells(state)[index]

const CELL_FIELDS: readonly (keyof CellView)[] = [
  'digit',
  'given',
  'candidates',
  'centers',
  'eliminated',
  'conflict',
  'wrong',
  'selected',
  'peer',
  'sameDigit',
  'cause',
  'placed',
  'hintTarget',
  'flashing',
]

/** True when both views draw alike. A runtime keeping one node per cell then skips the write. */
export const sameCellView = (a: CellView, b: CellView): boolean =>
  CELL_FIELDS.every((field) => a[field] === b[field])

export interface GridView {
  readonly readOnly: boolean
  readonly paused: boolean
  /** The solver reads the board, so cells show they are locked. */
  readonly solving: boolean
  /** The walkthrough draws its digits in the solver's voice. */
  readonly walkthrough: boolean
  readonly pasteAllowed: boolean
  /** The conflict pulse, whose parity picks the keyframes so a repeat clash replays it. */
  readonly pulse: number | null
}

export const selectGrid = (state: State): GridView => ({
  readOnly: isGridReadOnly(state),
  paused: state.game.mode === 'playing' && state.game.paused,
  solving: state.pending?.task === 'solve',
  walkthrough: state.game.mode === 'walkthrough',
  pasteAllowed: isEditable(state),
  pulse: state.flash?.pulse ?? null,
})

export interface PadKey {
  readonly digit: Digit
  /** Digits still to place, never below zero. */
  readonly remaining: number
  readonly disabled: boolean
  readonly locked: boolean
  /** Whether the key reads as pressed, which only sticky numbers gives meaning. */
  readonly pressed: boolean | null
}

export function selectPad(state: State): readonly PadKey[] {
  const board = selectBoard(state)
  const readOnly = isGridReadOnly(state)
  const { sticky, stickyDigit } = state.input
  return DIGITS.map((digit) => {
    const remaining = Math.max(0, SIZE - digitCount(board, digit))
    const locked = stickyDigit === digit
    return {
      digit,
      remaining,
      disabled: remaining === 0 || readOnly,
      locked,
      pressed: sticky ? locked : null,
    }
  })
}

export type BusyTask = 'generate' | 'solve' | 'validate' | 'hint'

export interface Controls {
  readonly undo: boolean
  readonly redo: boolean
  readonly clear: boolean
  readonly autoFill: boolean
  readonly erase: boolean
  readonly sticky: boolean
  readonly stickyOn: boolean
  readonly hint: boolean
  readonly solve: boolean
  readonly solveBlock: ReturnType<typeof solveBlock>
  readonly validate: boolean
  readonly newPuzzle: boolean
  /** A new puzzle would throw away progress, which needs a confirm dialog first. */
  readonly confirmNewPuzzle: boolean
  readonly inputMode: boolean
  /** The request in flight, for the busy labels. */
  readonly busy: BusyTask | null
}

/** The board differs from where it started, so there is progress to lose. */
function hasProgress(game: Game): boolean {
  switch (game.mode) {
    case 'selecting':
    case 'won':
      return false
    case 'entering':
      return !isBoardEmpty(game.history.present)
    case 'playing':
    case 'walkthrough':
      return !boardsEqual(game.play.history.present, game.play.puzzle)
  }
}

function canClear(state: State): boolean {
  const { game } = state
  if (!canUndoRedo(state)) return false
  if (game.mode === 'entering') return !isBoardEmpty(game.history.present)
  const play = playOf(game)
  return play !== null && !boardsEqual(play.history.present, play.puzzle)
}

export function selectControls(state: State): Controls {
  const history: History | null = historyOf(state.game)
  const undoable = history !== null && canUndoRedo(state)
  const readOnly = isGridReadOnly(state)
  return {
    undo: undoable && history.past.length > 0,
    redo: undoable && history.future.length > 0,
    clear: canClear(state),
    autoFill: canAutoFill(state),
    erase: state.input.selected !== null && !readOnly,
    sticky: !readOnly,
    stickyOn: state.input.sticky,
    hint: canRequestHint(state),
    solve: canSolve(state),
    solveBlock: solveBlock(state),
    validate: canValidate(state),
    newPuzzle: !isBusy(state),
    confirmNewPuzzle: hasProgress(state.game),
    inputMode: state.game.mode !== 'walkthrough',
    busy: state.pending?.task ?? null,
  }
}

export interface StatusView {
  readonly difficulty: Difficulty | null
  readonly mistakes: number
  readonly overLimit: boolean
  readonly solved: boolean
  readonly paused: boolean
}

/** The status bar, shown in play and after a win. Seconds come apart, from `selectSeconds`. */
export function selectStatus(state: State): StatusView | null {
  const { game } = state
  if (game.mode !== 'playing' && game.mode !== 'won') return null
  const { difficulty, mistakes } = game.play
  return {
    difficulty,
    mistakes,
    overLimit: mistakes >= MISTAKE_LIMIT,
    solved: game.mode === 'won',
    paused: game.mode === 'playing' && game.paused,
  }
}

/** Whole seconds on the game clock at `now`, the one value a display timer redraws. */
export function selectSeconds(state: State, now: number): number {
  const play = playOf(state.game)
  return play === null ? 0 : elapsedSeconds(play.clock, now)
}

export interface WinView {
  readonly difficulty: Difficulty | null
  readonly mistakes: number
}

/** The win dialog, held back while an offered puzzle asks first. */
export function selectWin(state: State): WinView | null {
  const { game } = state
  if (game.mode !== 'won' || state.offer !== null) return null
  return { difficulty: game.play.difficulty, mistakes: game.play.mistakes }
}

export interface OfferView {
  readonly puzzle: string
  /** Starting it replaces a game, which the dialog says. */
  readonly replacesGame: boolean
}

export const selectOffer = (state: State): OfferView | null =>
  state.offer === null
    ? null
    : { puzzle: state.offer, replacesGame: state.game.mode !== 'selecting' }

export const selectHint = (state: State): Hint | null =>
  state.game.mode === 'playing' ? state.game.hint : null

export interface WalkthroughView {
  readonly steps: readonly Step[]
  /** The position shown, 0 for the board as given and `steps.length` for the solution. */
  readonly cursor: number
  /** The step that led to the position, or null at the start. */
  readonly step: Step | null
  readonly atStart: boolean
  readonly atEnd: boolean
}

export function selectWalkthrough(state: State): WalkthroughView | null {
  const { game } = state
  if (game.mode !== 'walkthrough') return null
  const { steps, cursor } = game.walk
  return {
    steps,
    cursor,
    step: currentStep(game.walk),
    atStart: cursor === 0,
    atEnd: cursor === steps.length,
  }
}

export type GameKeyContext = Pick<
  KeyContext,
  'gridReadOnly' | 'canUndo' | 'canSticky' | 'stickyLocked' | 'walkthrough'
>

/** The keymap's facts that come from the game. Focus, typing and dialogs come from the page. */
export const selectKeyContext = (state: State): GameKeyContext => ({
  gridReadOnly: isGridReadOnly(state),
  canUndo: canUndoRedo(state),
  canSticky: !isGridReadOnly(state),
  stickyLocked: state.input.stickyDigit !== null,
  walkthrough: state.game.mode === 'walkthrough',
})

export const SWEEP_STAGGER_MS = 25
export const RIPPLE_STAGGER_MS = 25
export const REVEAL_STAGGER_MS = 30

/** A rare one-shot tint across several cells, played once for the board change that caused it. */
export interface BoardMoment {
  /** A completed unit sweeps, a win ripples, a new puzzle reveals and an undo or redo marks what reverted. */
  readonly kind: 'sweep' | 'ripple' | 'reveal' | 'revert'
  /** The cells it plays on, each with its start delay in milliseconds. */
  readonly delays: ReadonlyMap<CellIndex, number>
}

export interface BoardChange {
  readonly move: BoardMove | null
  readonly moment: BoardMoment | null
}

const NO_CHANGE: BoardChange = { move: null, moment: null }

const withDelays = (
  kind: BoardMoment['kind'],
  cells: readonly CellIndex[],
  delayOf: (index: CellIndex) => number,
): BoardMoment | null =>
  cells.length === 0
    ? null
    : { kind, delays: new Map(cells.map((index) => [index, delayOf(index)])) }

/** Undo and redo step along one history, while every other change writes a new board. */
function isStep(prev: History, next: History): boolean {
  const undone = next.present === prev.past.at(-1) && next.future[0] === prev.present
  const redone = next.present === prev.future[0] && next.past.at(-1) === prev.present
  return undone || redone
}

/** Each completed unit runs in its own order, and a cell shared by two runs takes the earlier start. */
function sweepOf(units: readonly (readonly CellIndex[])[]): BoardMoment {
  const delays = new Map<CellIndex, number>()
  for (const unit of units) {
    unit.forEach((index, order) => {
      const delay = order * SWEEP_STAGGER_MS
      delays.set(index, Math.min(delays.get(index) ?? delay, delay))
    })
  }
  return { kind: 'sweep', delays }
}

function momentOf(prev: State, next: State, move: BoardMove | null): BoardMoment | null {
  const before = selectBoard(prev)
  const after = selectBoard(next)
  const prevHistory = historyOf(prev.game)
  const nextHistory = historyOf(next.game)
  if (prevHistory !== null && nextHistory !== null && isStep(prevHistory, nextHistory)) {
    return withDelays('revert', changedCells(before, after), () => 0)
  }
  if (nextHistory !== null && nextHistory.past.length === 0 && nextHistory.future.length === 0) {
    // A validated custom puzzle keeps the digits already shown, so only digits new to the board fade in.
    const revealed = CELLS.filter((index) => {
      const digit = valueAt(after, index)
      return digit !== null && digit !== valueAt(before, index)
    })
    return withDelays('reveal', revealed, (index) => boxOf(index) * REVEAL_STAGGER_MS)
  }
  const play = playOf(next.game)
  const solution = play?.solution ?? null
  if (move?.kind !== 'place' || solution === null) return null
  if (next.game.mode === 'won') {
    return withDelays('ripple', CELLS, (index) =>
      Math.round(
        Math.hypot(rowOf(index) - rowOf(move.index), colOf(index) - colOf(move.index)) *
          RIPPLE_STAGGER_MS,
      ),
    )
  }
  const completed = completedUnits(after, solution, move.index)
  return completed.length > 0 ? sweepOf(completed) : null
}

/** The move and moment behind a new board, so cells animate only what called for it. */
export function selectBoardChange(prev: State, next: State): BoardChange {
  const before = boardOf(prev.game)
  const after = boardOf(next.game)
  if (before === after || next.game.mode === 'walkthrough') return NO_CHANGE
  const move = findMove(selectBoard(prev), selectBoard(next))
  return { move, moment: momentOf(prev, next, move) }
}
