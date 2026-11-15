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

import { harness, mountPage, playing, savedGame } from '../test/app-page'
import { bindMenus, newPuzzleEvent } from './menus'

const ADDRESS = { search: '', href: 'https://wasudoku.h3nc4.com/' }
const item = (selector: string) => document.querySelector<HTMLElement>(selector)!

describe('newPuzzleEvent', () => {
  it('reads a difficulty or the custom action off a button', () => {
    const button = document.createElement('button')
    button.dataset['difficulty'] = 'hard'
    expect(newPuzzleEvent(button)).toEqual({ type: 'newGame', difficulty: 'hard' })
    button.dataset['difficulty'] = 'impossible'
    expect(newPuzzleEvent(button)).toBeNull()
    button.dataset['action'] = 'custom'
    expect(newPuzzleEvent(button)).toEqual({ type: 'enterCustom' })
  })
})

describe('bindMenus', () => {
  let dispose: () => void = () => undefined
  const confirmAbandon = vi.fn()

  beforeEach(() => {
    mountPage()
    confirmAbandon.mockClear()
  })

  afterEach(() => {
    dispose()
    vi.unstubAllGlobals()
  })

  function start(test = playing()) {
    dispose = bindMenus(document, test.store, ADDRESS, confirmAbandon)
    return test
  }

  it('copies a link or the board from the share menu', () => {
    const writeText = vi.fn(() => Promise.resolve())
    start(harness({ 'wasudoku.state.game': savedGame() }, { clipboard: { writeText } }))
    item('#share-menu [data-action="copy-link"]').click()
    expect(writeText).toHaveBeenLastCalledWith(
      expect.stringContaining('https://wasudoku.h3nc4.com/?p='),
    )
    item('#share-menu [data-action="copy-text"]').click()
    expect(writeText).toHaveBeenCalledTimes(2)
    item('#share-menu').click()
    expect(writeText).toHaveBeenCalledTimes(2)
  })

  it('asks before a new puzzle replaces progress, and starts one at once otherwise', () => {
    const test = start()
    test.store.dispatch({ type: 'select', index: 2 as never })
    test.store.dispatch({ type: 'digit', digit: 4 })
    item('#new-menu [data-difficulty="expert"]').click()
    expect(confirmAbandon).toHaveBeenCalledWith({ type: 'newGame', difficulty: 'expert' })
    test.store.dispatch({ type: 'clear' })
    // The layout binding enables the custom entry outside the selection screen.
    item('#new-menu [data-action="custom"]').removeAttribute('disabled')
    item('#new-menu [data-action="custom"]').click()
    expect(test.state().game.mode).toBe('entering')
    const before = test.state()
    item('#new-menu [role="separator"]').click()
    expect(test.state()).toBe(before)
  })

  it('starts a puzzle from the selection screen', () => {
    const test = start(harness())
    item('#selection-screen [data-difficulty="easy"]').click()
    expect(test.state().pending).toMatchObject({ task: 'generate', difficulty: 'easy' })
    item('#selection-screen h2').click()
    item('#custom-button').click()
    expect(test.state().game.mode).toBe('entering')
  })
})
