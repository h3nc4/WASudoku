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

import { NOTICES } from '../core/text/messages'
import { harness, mountPage, playing } from '../test/app-page'
import { fakeSolver } from '../test/runtime-fakes'
import { mountApp, startApp, updatePorts } from './app'
import { createToaster } from './toast'

const byId = (id: string) => document.getElementById(id)!

/** The media query and resize observer that createToaster reads, which jsdom lacks. */
function stubLayout() {
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    },
  )
}

describe('mountApp', () => {
  let dispose: () => void = () => undefined

  beforeEach(() => {
    stubLayout()
    mountPage()
  })

  afterEach(() => {
    dispose()
    vi.unstubAllGlobals()
  })

  function start(test = harness(), href = 'https://w/') {
    const toaster = createToaster(byId('toasts'))
    const history = { state: null, replaceState: vi.fn() }
    const unmount = mountApp(document, test.store, {
      toaster,
      address: { search: new URL(href).search, href },
      history,
    })
    dispose = () => {
      unmount()
      toaster.dispose()
    }
    return test
  }

  it('binds the page, from the selection screen into play', () => {
    const test = start()
    expect(byId('selection-screen').hidden).toBe(false)
    byId('custom-button').click()
    expect(byId('selection-screen').hidden).toBe(true)
    expect(byId('start-button').hidden).toBe(false)
    expect(test.state().game.mode).toBe('entering')
  })

  it('keeps focus on the cell when a control is pressed with a pointer', () => {
    start()
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    byId('number-pad').querySelector('button')!.dispatchEvent(press)
    expect(press.defaultPrevented).toBe(true)
    const elsewhere = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    byId('theme-button').dispatchEvent(elsewhere)
    expect(elsewhere.defaultPrevented).toBe(false)
    for (const id of ['start-button', 'exit-button']) {
      const taking = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      byId(id).dispatchEvent(taking)
      expect(taking.defaultPrevented).toBe(false)
    }
  })

  it('offers an undo of a cleared board from its toast', () => {
    const test = start()
    byId('custom-button').click()
    test.store.dispatch({ type: 'select', index: 0 as never })
    test.store.dispatch({ type: 'digit', digit: 5 })
    byId('clear-button').click()
    const toast = byId('toasts').querySelector('.toast')!
    expect(toast).toHaveTextContent(NOTICES.cleared)
    toast.querySelector<HTMLButtonElement>('.toast-action')!.click()
    expect(test.state().game.mode === 'entering' && test.state().game).toBeTruthy()
    expect(byId('cell-0').querySelector('.d')).toHaveTextContent('5')
  })

  it('asks before a new puzzle replaces progress', () => {
    const test = start()
    byId('custom-button').click()
    test.store.dispatch({ type: 'select', index: 0 as never })
    test.store.dispatch({ type: 'digit', digit: 5 })
    byId('new-menu').querySelector<HTMLElement>('[data-difficulty="easy"]')!.click()
    expect((byId('abandon-dialog') as HTMLDialogElement).open).toBe(true)
  })

  it('asks before a shortcut puzzle replaces a saved game in progress', () => {
    const saved = playing()
    saved.store.dispatch({ type: 'select', index: 2 as never })
    saved.store.dispatch({ type: 'digit', digit: 4 })
    const test = start(saved, 'https://w/?new=hard')
    expect((byId('abandon-dialog') as HTMLDialogElement).open).toBe(true)
    expect(test.state().pending).toBeNull()
    expect(test.state().game.mode).toBe('playing')
  })
})

describe('startApp', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    history.replaceState(null, '', '/')
  })

  it('starts the runtime on the page, and a shortcut puzzle from the query', () => {
    stubLayout()
    mountPage()
    // An engine shares storage between files, and a pooled puzzle would skip the generate.
    localStorage.clear()
    history.replaceState(null, '', '/?new=easy')
    const solver = fakeSolver()
    const stop = startApp(window, solver)
    expect(solver.calls.map(({ task }) => task.kind)).toEqual(['generate'])
    expect(location.search).toBe('')
    expect(byId('selection-screen').hidden).toBe(false)
    byId('theme-button').click()
    stop()
    byId('custom-button').click()
    expect(byId('start-button').hidden).toBe(true)
  })
})

describe('updatePorts', () => {
  it('finds the worker container only where the page has one, and reloads the page', () => {
    const reload = vi.fn()
    const page = { navigator: {}, document, location: { reload }, console }
    const ports = updatePorts(page as never)
    expect(ports.container).toBeUndefined()
    ports.reload()
    expect(reload).toHaveBeenCalled()
    const container = { register: vi.fn() }
    expect(
      updatePorts({ ...page, navigator: { serviceWorker: container } } as never).container,
    ).toBe(container)
  })
})
