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

import { selectMode } from '../core/game/selectors'
import { mountPage, playing } from '../test/app-page'
import { bindBoard } from './grid'

const cell = (index: number) => document.getElementById(`cell-${String(index)}`)!
const board = () => document.getElementById('board')!

function pasteEvent(data: string | null) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  const clipboardData = data === null ? null : { getData: () => data }
  Object.defineProperty(event, 'clipboardData', { value: clipboardData })
  return event
}

describe('bindBoard', () => {
  let dispose: () => void = () => undefined

  beforeEach(() => {
    vi.useFakeTimers()
    mountPage()
  })

  afterEach(() => {
    dispose()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function start(board?: string) {
    const test = playing(board)
    dispose = bindBoard(document, test.store)
    return test
  }

  it('draws the saved board into the prerendered cells', () => {
    start()
    expect(cell(0)).toHaveAttribute('aria-label', 'R1C1, 5, given')
    expect(cell(0)).toHaveAttribute('aria-readonly', 'true')
    expect(cell(0).querySelector('.d')).toHaveTextContent('5')
    expect(cell(2)).toHaveAttribute('aria-label', 'R1C3, empty')
  })

  it('selects the focused cell, shades its peers and writes only the cells that change', () => {
    const { state, store } = start()
    cell(2).focus()
    expect(state().input.selected).toBe(2)
    expect(cell(2)).toHaveAttribute('aria-selected', 'true')
    expect(cell(3)).toHaveAttribute('data-peer', '')
    expect(cell(80)).not.toHaveAttribute('data-peer')
    const untouched = cell(80).firstChild
    store.dispatch({ type: 'digit', digit: 4 })
    expect(cell(2).querySelector('.d')).toHaveTextContent('4')
    expect(cell(2)).toHaveAttribute('aria-label', 'R1C3, 4')
    expect(cell(80).firstChild).toBe(untouched)
  })

  it('keeps focus with a selection the keymap moves', () => {
    const { store } = start()
    cell(2).focus()
    store.dispatch({ type: 'move', direction: 'right' })
    expect(cell(3)).toHaveFocus()
    expect(cell(3).tabIndex).toBe(0)
    expect(cell(2).tabIndex).toBe(-1)
  })

  it('moves only the tab stop for a selection made away from the grid', () => {
    const { store } = start()
    store.dispatch({ type: 'select', index: 40 as never })
    expect(cell(40).tabIndex).toBe(0)
    expect(cell(40)).not.toHaveFocus()
    store.dispatch({ type: 'select', index: null })
    expect(cell(40).tabIndex).toBe(0)
  })

  it('drops the selection once focus leaves the board', () => {
    const { state } = start()
    cell(2).focus()
    const away = document.createElement('button')
    document.body.append(away)
    away.focus()
    vi.runAllTimers()
    expect(state().input.selected).toBeNull()
  })

  it('applies a locked sticky digit on a tap, and ignores a click off the cells', () => {
    const { store, state } = start()
    store.dispatch({ type: 'toggleSticky' })
    store.dispatch({ type: 'pad', digit: 4 })
    cell(2).click()
    expect(cell(2).querySelector('.d')).toHaveTextContent('4')
    const before = state()
    board().click()
    expect(state()).toBe(before)
  })

  it('hides a paused board behind the overlay, and resumes from it', () => {
    const { store, state } = start()
    const overlay = document.getElementById('pause-overlay')!
    expect(overlay.hidden).toBe(true)
    store.dispatch({ type: 'pause' })
    expect(board()).toHaveAttribute('data-paused', '')
    expect(board()).toHaveAttribute('aria-readonly', 'true')
    expect(overlay.hidden).toBe(false)
    document.getElementById('resume-button')!.click()
    expect(board()).not.toHaveAttribute('data-paused')
    expect(board()).not.toHaveAttribute('aria-readonly')
    expect(state().game.mode).toBe('playing')
  })

  it('marks the board busy while the solver reads it', () => {
    const { store } = start()
    store.dispatch({ type: 'solve' })
    expect(board()).toHaveAttribute('aria-busy', 'true')
  })

  it('offers a pasted puzzle, but leaves a paste to a field, a dialog or an empty clipboard', () => {
    const { state } = start()
    const puzzle = '1'.padEnd(81, '.')
    const field = document.createElement('input')
    document.body.append(field)
    field.dispatchEvent(pasteEvent(puzzle))
    document.body.dispatchEvent(pasteEvent(''))
    document.body.dispatchEvent(pasteEvent(null))
    document.getElementById('win-dialog')!.setAttribute('open', '')
    document.body.dispatchEvent(pasteEvent(puzzle))
    document.getElementById('win-dialog')!.removeAttribute('open')
    expect(state().offer).toBeNull()
    const event = pasteEvent(puzzle)
    cell(2).dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(state().offer).toBe(puzzle)
  })

  it('stops drawing once disposed', () => {
    const { store } = start()
    dispose()
    store.dispatch({ type: 'select', index: 2 as never })
    expect(cell(2)).not.toHaveAttribute('aria-selected')
    expect(selectMode(store.select((s) => s)())).toBe('playing')
    dispose = () => undefined
  })
})
