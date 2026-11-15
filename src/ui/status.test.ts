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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { harness, mountPage, playing, solvedExcept } from '../test/app-page'
import { bindStatus } from './status'

const part = (name: string) => document.querySelector<HTMLElement>(`[data-status="${name}"]`)!
const bar = () => document.getElementById('game-status')!
const pause = () => document.getElementById('pause-button')!

describe('bindStatus', () => {
  let dispose: () => void = () => undefined

  beforeEach(() => {
    mountPage()
  })

  afterEach(() => {
    dispose()
    vi.unstubAllGlobals()
  })

  it('stays hidden on the selection screen', () => {
    dispose = bindStatus(document, harness().store)
    expect(bar().hidden).toBe(true)
  })

  it('shows the difficulty and mistakes, the limit in the error tone', () => {
    const test = playing()
    dispose = bindStatus(document, test.store)
    expect(bar().hidden).toBe(false)
    expect(part('difficulty')).toHaveTextContent('Easy')
    expect(part('mistakes')).toHaveTextContent('0/3')
    expect(part('mistakes')).not.toHaveClass('text-error')
    test.store.dispatch({ type: 'select', index: 2 as never })
    for (const digit of [5, 3, 9] as const) test.store.dispatch({ type: 'digit', digit })
    expect(part('mistakes')).toHaveTextContent('3/3')
    expect(part('mistakes')).toHaveClass('text-error', 'font-bold')
  })

  it('ticks the clock and pauses it from its button', () => {
    const test = playing()
    dispose = bindStatus(document, test.store)
    expect(part('time')).toHaveTextContent('00:00')
    test.timers.advance(61_000)
    expect(part('time')).toHaveTextContent('01:01')
    pause().click()
    expect(test.state().game).toMatchObject({ mode: 'playing', paused: true })
  })

  it('says solved and drops the pause button after a win', () => {
    const test = playing(solvedExcept(2))
    dispose = bindStatus(document, test.store)
    expect(part('solved').hidden).toBe(true)
    test.store.dispatch({ type: 'select', index: 2 as never })
    test.store.dispatch({ type: 'digit', digit: 4 })
    expect(part('solved').hidden).toBe(false)
    expect(pause().hidden).toBe(true)
  })
})
