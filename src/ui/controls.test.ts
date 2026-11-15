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

import { BUTTON_LABELS, CLEAR_TITLES, SOLVE_TITLES, START_TITLES } from '../core/text/labels'
import { answerSolve, harness, mountPage, playing, solvedExcept } from '../test/app-page'
import { bindControls, BUSY_LABEL_DELAY_MS } from './controls'

const button = (id: string) => document.getElementById(id) as HTMLButtonElement
const label = (id: string) => button(id).querySelector('[data-label]')!.textContent
const radio = (value: string) =>
  document.querySelector<HTMLInputElement>(`#input-mode input[value="${value}"]`)!

describe('bindControls', () => {
  let dispose: () => void = () => undefined
  const ports = { confirmReveal: vi.fn(), notify: vi.fn() }

  beforeEach(() => {
    vi.useFakeTimers()
    mountPage()
    ports.confirmReveal.mockClear()
    ports.notify.mockClear()
  })

  afterEach(() => {
    dispose()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function start(test = playing()) {
    dispose = bindControls(document, test.store, ports)
    return test
  }

  it('enables what a game in play allows', () => {
    start()
    expect(button('undo-button').disabled).toBe(false)
    expect(button('redo-button').disabled).toBe(true)
    expect(button('autofill-button').disabled).toBe(false)
    expect(button('erase-button').disabled).toBe(true)
    expect(button('hint-button').disabled).toBe(false)
    expect(button('solve-button').disabled).toBe(false)
    expect(button('solve-button')).toHaveAttribute('title', SOLVE_TITLES.ready)
    expect(button('clear-button')).toHaveAttribute('title', CLEAR_TITLES.playing)
    expect(button('new-button')).toBeEnabled()
  })

  it('names why Solve is off', () => {
    const test = start()
    test.store.dispatch({ type: 'select', index: 2 as never })
    test.store.dispatch({ type: 'digit', digit: 5 })
    expect(button('solve-button').disabled).toBe(true)
    expect(button('solve-button')).toHaveAttribute('title', SOLVE_TITLES.conflicts)
  })

  it('names the full board after a win and the empty one on the selection screen', () => {
    const won = playing(solvedExcept(2))
    start(won)
    won.store.dispatch({ type: 'select', index: 2 as never })
    won.store.dispatch({ type: 'digit', digit: 4 })
    expect(button('solve-button')).toHaveAttribute('title', SOLVE_TITLES.full)
    dispose()
    start(harness())
    expect(button('solve-button')).toHaveAttribute('title', SOLVE_TITLES.empty)
    expect(button('clear-button')).toHaveAttribute('title', CLEAR_TITLES.other)
  })

  it('starts a typed-in puzzle once it has digits', () => {
    const test = start(harness())
    test.store.dispatch({ type: 'enterCustom' })
    expect(button('start-button').disabled).toBe(true)
    expect(button('start-button')).toHaveAttribute('title', START_TITLES.empty)
    test.store.dispatch({ type: 'select', index: 0 as never })
    test.store.dispatch({ type: 'digit', digit: 5 })
    expect(button('start-button')).toHaveAttribute('title', START_TITLES.ready)
    button('start-button').click()
    expect(test.state().pending?.task).toBe('validate')
    vi.advanceTimersByTime(BUSY_LABEL_DELAY_MS)
    expect(label('start-button')).toBe(BUTTON_LABELS.validating)
  })

  it('shows a busy label only for a request that runs long', () => {
    const test = start(harness())
    test.store.dispatch({ type: 'newGame', difficulty: 'easy' })
    expect(button('new-button')).toHaveAttribute('disabled')
    expect(label('new-button')).toBe(BUTTON_LABELS.newPuzzle)
    vi.advanceTimersByTime(BUSY_LABEL_DELAY_MS)
    expect(label('new-button')).toBe(BUTTON_LABELS.generating)
    test.store.dispatch({ type: 'failed', id: test.state().pending!.id, reason: 'crashed' })
    expect(label('new-button')).toBe(BUTTON_LABELS.newPuzzle)
  })

  it('labels a long solve, and a hint never', () => {
    const test = start()
    test.store.dispatch({ type: 'hint' })
    vi.advanceTimersByTime(BUSY_LABEL_DELAY_MS)
    expect(label('solve-button')).toBe(BUTTON_LABELS.solve)
    test.store.dispatch({ type: 'failed', id: test.state().pending!.id, reason: 'crashed' })
    test.store.dispatch({ type: 'solve' })
    vi.advanceTimersByTime(BUSY_LABEL_DELAY_MS)
    expect(label('solve-button')).toBe(BUTTON_LABELS.solving)
  })

  it('follows the input mode, and sets it from the radios', () => {
    const test = start()
    expect(radio('normal').checked).toBe(true)
    radio('center').checked = true
    radio('center').dispatchEvent(new Event('change', { bubbles: true }))
    expect(test.state().input.mode).toBe('center')
    test.store.dispatch({ type: 'cycleMode' })
    expect(radio('normal').checked).toBe(true)
    document.getElementById('input-mode')!.dispatchEvent(new Event('change'))
    expect(test.state().input.mode).toBe('normal')
  })

  it('freezes the input mode during a walkthrough', () => {
    const test = start()
    test.store.dispatch({ type: 'solve' })
    answerSolve(test)
    expect((document.getElementById('input-mode') as HTMLFieldSetElement).disabled).toBe(true)
    button('exit-button').click()
    expect(test.state().game.mode).toBe('playing')
  })

  it('sends each press to the store, with the notices that go with them', () => {
    const test = start()
    test.store.dispatch({ type: 'select', index: 2 as never })
    test.store.dispatch({ type: 'digit', digit: 4 })
    button('undo-button').click()
    expect(test.state().game.mode === 'playing' && test.state().input.selected).toBe(2)
    button('redo-button').click()
    button('erase-button').click()
    expect(button('redo-button').disabled).toBe(true)
    button('sticky-button').click()
    expect(button('sticky-button')).toHaveAttribute('aria-pressed', 'true')
    expect(button('sticky-button')).toHaveAttribute('data-variant', 'primary')
    expect(button('sticky-button').querySelector('use')).toHaveAttribute('href', '#i-lock')
    button('sticky-button').click()
    expect(button('sticky-button').querySelector('use')).toHaveAttribute('href', '#i-lock-open')
    button('autofill-button').click()
    expect(ports.notify).toHaveBeenLastCalledWith('autoFilled')
    button('clear-button').click()
    expect(ports.notify).toHaveBeenLastCalledWith('cleared')
    button('solve-button').click()
    expect(ports.confirmReveal).toHaveBeenCalledTimes(1)
    button('hint-button').click()
    expect(test.state().pending?.task).toBe('hint')
  })
})
