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

import { describe, expect, it } from 'vitest'

import {
  clockFromSeconds,
  elapsedMs,
  elapsedSeconds,
  isRunning,
  msToNextSecond,
  start,
  stop,
  STOPPED_CLOCK,
} from './clock'

describe('clock', () => {
  it('reads zero before it starts and does not move while stopped', () => {
    expect(elapsedMs(STOPPED_CLOCK, 5_000)).toBe(0)
    expect(isRunning(STOPPED_CLOCK)).toBe(false)
  })

  it('counts from its start and banks the run when stopped', () => {
    const running = start(STOPPED_CLOCK, 1_000)
    expect(isRunning(running)).toBe(true)
    expect(elapsedMs(running, 3_500)).toBe(2_500)
    const stopped = stop(running, 3_500)
    expect(stopped).toEqual({ elapsedMs: 2_500, runningSince: null })
    expect(elapsedMs(stopped, 99_000)).toBe(2_500)
  })

  it('adds a second run to the first, as pause and resume do', () => {
    const first = stop(start(STOPPED_CLOCK, 0), 1_200)
    const second = start(first, 10_000)
    expect(elapsedMs(second, 10_900)).toBe(2_100)
    expect(elapsedSeconds(second, 10_900)).toBe(2)
  })

  it('keeps the start of a running clock and leaves a stopped one alone', () => {
    const running = start(STOPPED_CLOCK, 1_000)
    expect(start(running, 2_000)).toBe(running)
    expect(stop(STOPPED_CLOCK, 2_000)).toBe(STOPPED_CLOCK)
  })

  it('never runs backwards when the system time does', () => {
    expect(elapsedMs(start(clockFromSeconds(3), 10_000), 9_000)).toBe(3_000)
  })

  it('restores whole seconds from storage, stopped', () => {
    expect(clockFromSeconds(754)).toEqual({ elapsedMs: 754_000, runningSince: null })
    expect(elapsedSeconds(clockFromSeconds(754), 0)).toBe(754)
  })

  it('says how long until the shown second changes', () => {
    const running = start(clockFromSeconds(1), 1_000)
    expect(msToNextSecond(running, 1_000)).toBe(1_000)
    expect(msToNextSecond(running, 1_250)).toBe(750)
  })
})
