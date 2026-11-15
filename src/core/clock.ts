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

export const MS_PER_SECOND = 1000

/** The game clock as data. Nothing ticks it: callers pass the time and read it back. */
export interface Clock {
  /** Time banked by every run that has stopped. */
  readonly elapsedMs: number
  /** When the current run started, or null while stopped. */
  readonly runningSince: number | null
}

export const STOPPED_CLOCK: Clock = { elapsedMs: 0, runningSince: null }

export const isRunning = (clock: Clock): boolean => clock.runningSince !== null

/** A clock that was stopped with this many seconds on it, as storage keeps them. */
export const clockFromSeconds = (seconds: number): Clock => ({
  elapsedMs: seconds * MS_PER_SECOND,
  runningSince: null,
})

/** Time on the clock at now. A clock never runs backwards, even when the system time does. */
export const elapsedMs = (clock: Clock, now: number): number =>
  clock.elapsedMs + (clock.runningSince === null ? 0 : Math.max(0, now - clock.runningSince))

/** Whole seconds on the clock, what the display and storage show. */
export const elapsedSeconds = (clock: Clock, now: number): number =>
  Math.floor(elapsedMs(clock, now) / MS_PER_SECOND)

/** Starts a stopped clock. A running one keeps its start. */
export const start = (clock: Clock, now: number): Clock =>
  clock.runningSince === null ? { ...clock, runningSince: now } : clock

/** Stops a running clock, banking the run. A stopped one is returned as it is. */
export const stop = (clock: Clock, now: number): Clock =>
  clock.runningSince === null ? clock : { elapsedMs: elapsedMs(clock, now), runningSince: null }

/** Time until the display next changes its whole second, for a timer that touches one element. */
export const msToNextSecond = (clock: Clock, now: number): number =>
  MS_PER_SECOND - (elapsedMs(clock, now) % MS_PER_SECOND)
