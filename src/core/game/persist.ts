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

import { EMPTY_BOARD } from '../board'
import { clockFromSeconds, elapsedSeconds } from '../clock'
import {
  type Loaded,
  type LoadedGame,
  type Metrics,
  type SavedGame,
  STORAGE_KEYS,
  type StorageKey,
  writeGame,
  writeMetrics,
  writePool,
} from '../codec/storage'
import { EMPTY_POOL, type Pool } from '../pool'
import type { Effect, Outcome } from './effects'
import type { LoadedSlices } from './events'
import { settlePlay } from './session'
import { type Game, newPlay, playOf, SELECTING, type State } from './state'

const ZERO_METRICS: Metrics = { timer: 0, mistakes: 0 }

/** The game as storage keeps it, or null on the selection screen, which is never saved. */
export function savedGame({ game }: State): SavedGame | null {
  switch (game.mode) {
    case 'selecting':
      return null
    case 'entering':
      return { history: game.history, puzzle: EMPTY_BOARD, solution: null, difficulty: null }
    case 'playing':
    case 'won':
    case 'walkthrough': {
      const { history, puzzle, difficulty } = game.play
      const solution = game.mode === 'walkthrough' ? game.walk.solution : game.play.solution
      return { history, puzzle, solution, difficulty }
    }
  }
}

/** The clock in whole seconds and the mistakes, zero for a puzzle being typed in. */
export function savedMetrics({ game }: State, now: number): Metrics {
  const play = playOf(game)
  return play === null
    ? ZERO_METRICS
    : { timer: elapsedSeconds(play.clock, now), mistakes: play.mistakes }
}

/** The text a save effect writes for its key, read off the state at the moment it runs. */
export function serialize(state: State, key: StorageKey, now: number): string | null {
  switch (key) {
    case STORAGE_KEYS.GAME: {
      const game = savedGame(state)
      return game === null ? null : writeGame(game)
    }
    case STORAGE_KEYS.METRICS:
      return writeMetrics(savedMetrics(state, now))
    case STORAGE_KEYS.POOL:
      return writePool(state.pool)
  }
}

const save = (key: StorageKey, when: 'idle' | 'now'): Effect => ({ kind: 'save', key, when })

const corruptKey = (
  key: StorageKey,
  loaded: LoadedGame | Loaded<Metrics> | Loaded<Pool>,
): Effect[] =>
  loaded.status === 'corrupt' ? [{ kind: 'corrupt', key, reason: loaded.reason }] : []

/** A saved game always resumes in play, a typed-in puzzle included, as the build it replaces does. */
function resumed(saved: SavedGame, metrics: Metrics): Game {
  const play = newPlay(saved.puzzle, saved.history, saved.solution, saved.difficulty)
  return settlePlay({ ...play, clock: clockFromSeconds(metrics.timer), mistakes: metrics.mistakes })
}

/** Builds the starting state from storage. A corrupt key costs only itself, and a legacy game is rewritten. */
export function onLoaded(state: State, { game, metrics, pool }: LoadedSlices): Outcome {
  const saved = game.status === 'ok' || game.status === 'legacy' ? game.value : null
  const next: State = {
    ...state,
    pool: pool.status === 'ok' ? pool.value : EMPTY_POOL,
    game:
      saved === null
        ? SELECTING
        : resumed(saved, metrics.status === 'ok' ? metrics.value : ZERO_METRICS),
  }
  const effects: Effect[] = [
    ...corruptKey(STORAGE_KEYS.GAME, game),
    ...corruptKey(STORAGE_KEYS.METRICS, metrics),
    ...corruptKey(STORAGE_KEYS.POOL, pool),
    save(STORAGE_KEYS.POOL, 'now'),
    save(STORAGE_KEYS.METRICS, 'now'),
  ]
  if (saved !== null)
    effects.push(save(STORAGE_KEYS.GAME, game.status === 'legacy' ? 'now' : 'idle'))
  effects.push({ kind: 'refill', pool: next.pool })
  return { state: next, effects }
}
