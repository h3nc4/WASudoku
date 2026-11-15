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

import { type Board, boardToString, EMPTY_BOARD, parseBoard, withGivens } from '../board'
import { buildShareUrl, readSharedPuzzle, stripSharedPuzzle } from '../codec/share'
import { startHistory } from '../history'
import { type Outcome, stay } from './effects'
import { canValidate, isEditable } from './guards'
import { request, settlePlay, startSession } from './session'
import { boardOf, newPlay, playOf, type State } from './state'

const WHITESPACE = /\s/g

export const onEnterCustom = (state: State): Outcome =>
  startSession(state, { mode: 'entering', history: startHistory(EMPTY_BOARD) })

export function onValidate(state: State): Outcome {
  const board = boardOf(state.game)
  if (board === null || !canValidate(state)) return stay(state)
  return request(state, { task: 'validate' }, { kind: 'validate', puzzle: boardToString(board) })
}

/** A typed-in puzzle with one solution starts as a custom game, its digits turned into givens. */
export function onValidated(state: State, solution: Board | null): Outcome {
  const { game } = state
  if (game.mode !== 'entering') return stay(state)
  if (solution === null) {
    return { state, effects: [{ kind: 'toast', message: 'invalidPuzzle', tone: 'error' }] }
  }
  const puzzle = withGivens(game.history.present)
  // Unlike a new puzzle from the menu, validation keeps the selection and the input mode.
  const play = newPlay(puzzle, startHistory(puzzle), solution, null)
  return {
    state: { ...state, game: settlePlay(play) },
    effects: [{ kind: 'toast', message: 'validated', tone: 'success' }],
  }
}

export const onValidateFailed = (state: State): Outcome => ({
  state,
  effects: [{ kind: 'toast', message: 'validateFailed', tone: 'error' }],
})

/** Opens an offered puzzle for validation, after which it plays as a custom puzzle. */
export function onAcceptOffer(state: State): Outcome {
  const board = state.offer === null ? null : parseBoard(state.offer)
  if (board === null) return stay(state)
  const entering = startSession(state, { mode: 'entering', history: startHistory(board) })
  const validating = request(
    entering.state,
    { task: 'validate' },
    { kind: 'validate', puzzle: boardToString(board) },
  )
  return { state: validating.state, effects: [...entering.effects, ...validating.effects] }
}

export const onDeclineOffer = (state: State): Outcome => stay({ ...state, offer: null })

/** A pasted puzzle is offered during play and replaces the board while one is typed in. */
export function onPaste(state: State, text: string): Outcome {
  if (!isEditable(state)) return stay(state)
  const puzzle = text.replaceAll(WHITESPACE, '')
  const board = parseBoard(puzzle)
  if (board === null)
    return { state, effects: [{ kind: 'toast', message: 'badPaste', tone: 'error' }] }
  if (state.game.mode !== 'entering') return stay({ ...state, offer: puzzle })
  return startSession(state, { mode: 'entering', history: startHistory(board) }, [
    { kind: 'toast', message: 'imported', tone: 'success' },
  ])
}

/** A shared link offers its puzzle once, and the address drops it so a reload does not offer it again. */
export function onOpened(state: State, search: string, href: string): Outcome {
  const puzzle = readSharedPuzzle(search)
  if (puzzle === null) return stay(state)
  return {
    state: { ...state, offer: puzzle },
    effects: [{ kind: 'replaceUrl', href: stripSharedPuzzle(href) }],
  }
}

const sharedBoard = (state: State): Board =>
  state.game.mode === 'entering'
    ? state.game.history.present
    : (playOf(state.game)?.puzzle ?? EMPTY_BOARD)

/** Copies the board as a puzzle string, progress included. */
export const onExport = (state: State): Outcome => ({
  state,
  effects: [
    { kind: 'copy', text: boardToString(boardOf(state.game) ?? EMPTY_BOARD), message: 'exported' },
  ],
})

/** Copies a link to the puzzle without the player's progress. */
export const onShare = (state: State, href: string): Outcome => ({
  state,
  effects: [
    {
      kind: 'copy',
      text: buildShareUrl(boardToString(sharedBoard(state)), href),
      message: 'linkCopied',
    },
  ],
})
