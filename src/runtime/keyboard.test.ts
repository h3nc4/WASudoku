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

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { savedGame, STORAGE_KEYS } from '../../e2e/saves'
import { valueAt } from '../core/board'
import { selectBoard, selectControls } from '../core/game/selectors'
import { CELLS } from '../core/geometry'
import { fakeDeps, MemoryStorage } from '../test/runtime-fakes'
import { asksForShortcuts, bindKeyboard, pressOf } from './keyboard'
import { loadSlices } from './storage'
import { createStore } from './store'

const EMPTY_CELL = CELLS[2]

let unbind: () => void
let store: ReturnType<typeof createStore>

beforeEach(() => {
  document.body.innerHTML = `
    <div role="grid"><div role="row"><div role="gridcell" tabindex="0"><span>.</span></div></div></div>
    <input id="field" /><input id="locked" readonly /><input id="mode" type="radio" />
    <input id="check" type="checkbox" /><input id="search" type="search" /><textarea></textarea><div id="editor"></div>
    <dialog id="dialog"><button>Close</button></dialog>
  `
  const { deps, storage } = fakeDeps({
    storage: new MemoryStorage({ [STORAGE_KEYS.GAME]: savedGame() }),
  })
  store = createStore(deps)
  store.dispatch({ type: 'loaded', slices: loadSlices(storage, deps.log) })
  store.dispatch({ type: 'select', index: EMPTY_CELL })
  unbind = bindKeyboard(document, store)
})

afterEach(() => {
  unbind()
  store.dispose()
})

/** Presses a key on `target`, returning whether the browser's own handling was stopped. */
function press(target: Element, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

const element = (selector: string): Element => document.querySelector(selector)!
const digitAt = () => valueAt(store.select(selectBoard)(), EMPTY_CELL)
const sticky = () => store.select(selectControls)().stickyOn

describe('bindKeyboard', () => {
  it('reads a press off the event', () => {
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true })
    expect(pressOf(event)).toEqual({ key: 'z', ctrl: true, meta: false, alt: false, shift: true })
  })

  it('enters a digit typed on a grid cell and keeps the key from the browser', () => {
    expect(press(element('[role="gridcell"] span'), '4')).toBe(true)
    expect(digitAt()).toBe(4)
  })

  it('leaves digits typed outside the grid alone', () => {
    expect(press(document.body, '4')).toBe(false)
    expect(digitAt()).toBeNull()
  })

  it('undoes with Ctrl+Z anywhere on the page', () => {
    press(element('[role="gridcell"]'), '4')
    expect(press(document.body, 'z', { ctrlKey: true })).toBe(true)
    expect(digitAt()).toBeNull()
  })

  it('toggles sticky numbers on S, except while a field takes typing', () => {
    expect(press(element('#field'), 's')).toBe(false)
    expect(press(element('textarea'), 'S')).toBe(false)
    const editor = element('#editor')
    Object.defineProperty(editor, 'isContentEditable', { value: true })
    expect(press(editor, 's')).toBe(false)
    expect(sticky()).toBe(false)
    expect(press(element('#locked'), 's')).toBe(true)
    expect(sticky()).toBe(true)
  })

  it('toggles sticky numbers on S from a radio or checkbox, which take no typing', () => {
    expect(press(element('#search'), 's')).toBe(false)
    expect(sticky()).toBe(false)
    expect(press(element('#mode'), 's')).toBe(true)
    expect(sticky()).toBe(true)
    expect(press(element('#check'), 's')).toBe(true)
    expect(sticky()).toBe(false)
  })

  it('releases a locked digit on Escape and lets the browser have the key too', () => {
    press(document.body, 's')
    store.dispatch({ type: 'pad', digit: 4 })
    expect(press(document.body, 'Escape')).toBe(false)
    store.dispatch({ type: 'tap', index: EMPTY_CELL })
    expect(digitAt()).toBeNull()
  })

  it('leaves page keys to an open dialog', () => {
    const dialog = element('#dialog')
    dialog.setAttribute('open', '')
    expect(press(dialog, 's')).toBe(false)
    expect(sticky()).toBe(false)
  })

  it('skips a key that is part of a composition', () => {
    expect(press(element('[role="gridcell"]'), '4', { isComposing: true })).toBe(false)
    expect(digitAt()).toBeNull()
  })

  it('stops listening once unbound', () => {
    unbind()
    press(element('[role="gridcell"]'), '4')
    expect(digitAt()).toBeNull()
  })
})

describe('asksForShortcuts', () => {
  const asks = (target: Element, init: KeyboardEventInit = {}): boolean => {
    let asked = false
    const listener = (event: KeyboardEvent) => {
      asked = asksForShortcuts(document, event)
    }
    document.addEventListener('keydown', listener)
    press(target, '?', { shiftKey: true, ...init })
    document.removeEventListener('keydown', listener)
    return asked
  }

  it('takes ? on the grid and on a button, as the game keys read them', () => {
    expect(asks(element('[role="gridcell"]'))).toBe(true)
    expect(asks(element('#check'))).toBe(true)
  })

  it('leaves ? to a text field, an open dialog and a composition', () => {
    expect(asks(element('#field'))).toBe(false)
    expect(asks(element('[role="gridcell"]'), { isComposing: true })).toBe(false)
    element('#dialog').setAttribute('open', '')
    expect(asks(element('[role="gridcell"]'))).toBe(false)
  })
})
