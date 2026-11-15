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

import { mistakeAnnouncement, SOLVED_ANNOUNCEMENT } from '../core/text/labels'
import { answerSolve, mountPage, playing, solvedExcept, STEPS } from '../test/app-page'
import { bindAnnouncer, bindHint, hintLine } from './hint'

const slot = () => document.getElementById('hint-slot')!
const part = (name: string) => slot().querySelector(`[data-hint="${name}"]`)!.textContent
const announcer = () => document.getElementById('announcer')!

describe('hintLine', () => {
  it('names a step by its technique and a cell hint by what to do', () => {
    expect(hintLine({ kind: 'step', step: STEPS[0] })).toEqual({
      where: 'R1C3',
      label: 'Naked Single',
    })
    expect(hintLine({ kind: 'mistake', index: 10 as never })).toEqual({
      where: 'R2C2',
      label: 'Check this cell',
    })
    expect(hintLine({ kind: 'reveal', index: 80 as never, digit: 9 })).toEqual({
      where: 'R9C9',
      label: 'Reveal',
    })
  })
})

describe('bindHint and bindAnnouncer', () => {
  const disposers: (() => void)[] = []

  beforeEach(() => {
    mountPage()
  })

  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose()
    vi.unstubAllGlobals()
  })

  function start(board?: string) {
    const test = playing(board)
    disposers.push(bindHint(document, test.store), bindAnnouncer(document, test.store))
    return test
  }

  it('opens the strip with the hint, speaks it, and closes it on dismiss', () => {
    const test = start()
    expect(slot()).not.toHaveAttribute('data-open')
    expect(slot().inert).toBe(true)
    test.store.dispatch({ type: 'hint' })
    answerSolve(test)
    expect(slot()).toHaveAttribute('data-open', '')
    expect(slot()).toHaveAttribute('aria-hidden', 'false')
    expect(slot().inert).toBe(false)
    expect(part('where')).toBe('R1C3')
    expect(part('label')).toBe('Naked Single')
    expect(part('text')).toBe('Cell R1C3 has only one possible candidate left, 4.')
    expect(announcer()).toHaveTextContent(part('text'))
    document.getElementById('dismiss-hint')!.click()
    expect(slot()).not.toHaveAttribute('data-open')
    expect(slot()).toHaveAttribute('aria-hidden', 'true')
    expect(part('where')).toBe('R1C3')
  })

  it('speaks a mistake as it is counted, and the win', () => {
    const test = start(solvedExcept(2, 3))
    test.store.dispatch({ type: 'select', index: 2 as never })
    test.store.dispatch({ type: 'digit', digit: 1 })
    expect(announcer()).toHaveTextContent(mistakeAnnouncement(1))
    test.store.dispatch({ type: 'erase', how: 'delete' })
    expect(announcer()).toHaveTextContent(mistakeAnnouncement(1))
    test.store.dispatch({ type: 'digit', digit: 4 })
    test.store.dispatch({ type: 'select', index: 3 as never })
    test.store.dispatch({ type: 'digit', digit: 6 })
    expect(announcer()).toHaveTextContent(SOLVED_ANNOUNCEMENT)
  })
})
