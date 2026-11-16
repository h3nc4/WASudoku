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

import { type Clock, elapsedSeconds, isRunning, msToNextSecond, start, stop } from '../clock'
import { type Metrics, STORAGE_KEYS, type StorageKey } from '../codec/storage'
import type { Digit } from '../digits'
import { add } from '../pool'
import { isDigitComplete } from '../rules'
import { type Effect, type Outcome, stay } from './effects'
import {
  onAcceptOffer,
  onDeclineOffer,
  onEnterCustom,
  onExport,
  onOpened,
  onPaste,
  onShare,
  onValidate,
  onValidated,
  onValidateFailed,
} from './entering'
import type { Event, EventType } from './events'
import { isClockRunning } from './guards'
import { onDismissHint, onHint, onHintFailed, onHintSolved } from './hint'
import { onLoaded, savedGame, savedMetrics } from './persist'
import {
  inputGame,
  onAutoFill,
  onClear,
  onCycleMode,
  onDigit,
  onErase,
  onGenerated,
  onHidden,
  onMove,
  onNewGame,
  onPadInput,
  onPause,
  onResume,
  onSelect,
  onSetMode,
  onUndoRedo,
} from './playing'
import { answered, settled } from './session'
import { boardIn, boardOf, type Game, type Play, playOf, type State } from './state'
import { lockSticky, onTap, onToggleSticky, settleSticky } from './sticky'
import {
  onExitWalkthrough,
  onSolve,
  onSolved,
  onSolveFailed,
  onStep,
  onViewStep,
} from './walkthrough'

/** A running game writes its metrics on this whole second, besides on pause, hide and win. */
export const METRICS_EVERY_SECONDS = 10

/** A pad key is off for a digit placed nine times already. */
function onPad(state: State, digit: Digit): Outcome {
  const game = inputGame(state)
  if (game === null || isDigitComplete(boardIn(game), digit)) return stay(state)
  const { sticky, stickyDigit } = state.input
  if (sticky) return lockSticky(state, digit === stickyDigit ? null : digit)
  return onPadInput(state, game, digit)
}

function onTick(state: State, now: number): Outcome {
  const clock = playOf(state.game)?.clock
  if (clock === undefined || !isClockRunning(state)) return stay(state)
  const effects: Effect[] = [{ kind: 'tick', delayMs: msToNextSecond(clock, now) }]
  if (elapsedSeconds(clock, now) % METRICS_EVERY_SECONDS === 0) {
    effects.push({ kind: 'save', key: STORAGE_KEYS.METRICS, when: 'now' })
  }
  return { state, effects }
}

function onReply(state: State, event: Extract<Event, { id: unknown }>): Outcome {
  const pending = answered(state, event.id)
  if (pending === null) return stay(state)
  const next = settled(state)
  switch (event.type) {
    case 'solved':
      if (pending.task === 'hint') return onHintSolved(next, event.result)
      return pending.task === 'solve' ? onSolved(next, event.result) : stay(state)
    case 'validated':
      return pending.task === 'validate' ? onValidated(next, event.solution) : stay(state)
    case 'generated':
      return pending.task === 'generate'
        ? onGenerated(next, pending.difficulty, event.puzzle)
        : stay(state)
    case 'failed':
      switch (pending.task) {
        case 'solve':
          return onSolveFailed(next)
        case 'hint':
          return onHintFailed(next)
        case 'validate':
          return onValidateFailed(next)
        case 'generate':
          return {
            state: next,
            effects: [{ kind: 'toast', message: 'generateFailed', tone: 'error' }],
          }
      }
  }
}

type EventOf = { readonly [E in Event as E['type']]: E }
type Handlers = {
  readonly [K in EventType]: (state: State, event: EventOf[K], now: number) => Outcome
}

/** One handler per event type, so adding an event without its handler fails to compile. */
const HANDLERS: Handlers = {
  digit: (state, event) => onDigit(state, event.digit),
  pad: (state, event) => onPad(state, event.digit),
  erase: (state, event) => onErase(state, event.how),
  move: (state, event) => onMove(state, event.direction),
  select: (state, event) => onSelect(state, event.index),
  tap: (state, event) => onTap(state, event.index),
  setMode: (state, event) => onSetMode(state, event.mode),
  cycleMode: onCycleMode,
  toggleSticky: onToggleSticky,
  releaseSticky: (state) => lockSticky(state, null),
  undo: (state, event) => onUndoRedo(state, event.type),
  redo: (state, event) => onUndoRedo(state, event.type),
  clear: onClear,
  autoFill: onAutoFill,
  hint: onHint,
  dismissHint: onDismissHint,
  solve: onSolve,
  newGame: (state, event) => onNewGame(state, event.difficulty),
  enterCustom: onEnterCustom,
  validate: onValidate,
  pause: onPause,
  resume: onResume,
  paste: (state, event) => onPaste(state, event.text),
  acceptOffer: onAcceptOffer,
  declineOffer: onDeclineOffer,
  export: onExport,
  share: (state, event) => onShare(state, event.href),
  viewStep: (state, event) => onViewStep(state, event.cursor),
  step: (state, event) => onStep(state, event.delta),
  exitWalkthrough: onExitWalkthrough,
  loaded: (state, event) => onLoaded(state, event.slices),
  opened: (state, event) => onOpened(state, event.search, event.href),
  hidden: onHidden,
  tick: (state, _event, now) => onTick(state, now),
  flashEnded: (state, event) =>
    stay(state.flash?.pulse === event.pulse ? { ...state, flash: null } : state),
  solved: onReply,
  validated: onReply,
  generated: onReply,
  failed: onReply,
  refilled: (state, event) => stay({ ...state, pool: add(state.pool, event.puzzles) }),
}

// The type travels apart from the event so the handler and its event stay correlated.
const handle = <K extends EventType>(type: K, state: State, event: EventOf[K], now: number) =>
  HANDLERS[type](state, event, now)

type PlayGame = Extract<Game, { readonly play: Play }>

const playGame = (game: Game): PlayGame | null =>
  game.mode === 'selecting' || game.mode === 'entering' ? null : game

const withPlay = (game: PlayGame, play: Play): Game => ({ ...game, play })

/** A board change cancels a hint in flight and lets solving run again. A shown hint went with the edit. */
function afterBoardChange(prev: State, next: State, effects: Effect[]): State {
  if (boardOf(prev.game) === boardOf(next.game)) return next
  let state = next
  if (state.pending?.task === 'hint') {
    effects.push({ kind: 'cancel', id: state.pending.id })
    state = { ...state, pending: null }
  }
  const played = playGame(state.game)
  if (played?.play.solveFailed === true) {
    state = { ...state, game: withPlay(played, { ...played.play, solveFailed: false }) }
  }
  return state
}

/** Runs the clock exactly while a game is played unpaused. */
function syncClock(state: State, now: number): State {
  const game = playGame(state.game)
  if (game === null) return state
  const { play } = game
  const clock = isClockRunning(state) ? start(play.clock, now) : stop(play.clock, now)
  return clock === play.clock ? state : { ...state, game: withPlay(game, { ...play, clock }) }
}

const clockOf = (state: State): Clock | null => playOf(state.game)?.clock ?? null

const sameMetrics = (a: Metrics | null, b: Metrics | null): boolean =>
  a?.timer === b?.timer && a?.mistakes === b?.mistakes

const metricsAt = (state: State, now: number): Metrics | null =>
  state.game.mode === 'selecting' ? null : savedMetrics(state, now)

function sameGame(prev: State, next: State): boolean {
  const a = savedGame(prev)
  const b = savedGame(next)
  if (a === null || b === null) return a === b
  return (
    a.history === b.history &&
    a.puzzle === b.puzzle &&
    a.solution === b.solution &&
    a.difficulty === b.difficulty
  )
}

/** Adds the clock timer, the saves and the pool refill that every transition implies. */
function implied(prev: State, next: State, now: number): Effect[] {
  const effects: Effect[] = []
  const before = clockOf(prev)
  const after = clockOf(next)
  const stopped = before !== null && isRunning(before) && (after === null || !isRunning(after))
  if (after !== null && after !== before && isRunning(after)) {
    effects.push({ kind: 'tick', delayMs: msToNextSecond(after, now) })
  } else if (stopped) {
    effects.push({ kind: 'tick', delayMs: null })
  }
  if (next.game.mode !== 'selecting' && !sameGame(prev, next)) {
    effects.push({ kind: 'save', key: STORAGE_KEYS.GAME, when: 'idle' })
  }
  if (stopped || !sameMetrics(metricsAt(prev, now), metricsAt(next, now))) {
    effects.push({ kind: 'save', key: STORAGE_KEYS.METRICS, when: 'now' })
  }
  if (prev.pool !== next.pool) {
    effects.push(
      { kind: 'save', key: STORAGE_KEYS.POOL, when: 'now' },
      { kind: 'refill', pool: next.pool },
    )
  }
  return effects
}

const savesKey = (effects: readonly Effect[], key: StorageKey): boolean =>
  effects.some((effect) => effect.kind === 'save' && effect.key === key && effect.when === 'now')

/** Drops an implied effect the handler already asked for. */
function merge(own: readonly Effect[], extra: readonly Effect[]): Effect[] {
  const kept = extra.filter((effect) => {
    if (effect.kind === 'save') return !savesKey(own, effect.key)
    if (effect.kind === 'refill') return !own.some((other) => other.kind === 'refill')
    return true
  })
  return [...own, ...kept]
}

/** The game after one event at time `now`, with the effects the runtime performs for it, in order. */
export function update(state: State, event: Event, now: number): Outcome {
  const outcome = handle(event.type, state, event, now)
  const effects = [...outcome.effects]
  const next = syncClock(afterBoardChange(state, settleSticky(state, outcome.state), effects), now)
  return { state: next, effects: merge(effects, implied(state, next, now)) }
}
