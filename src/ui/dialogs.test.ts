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

import { harness, mountPage, playing, PUZZLE, solvedExcept } from '../test/app-page'
import { bindDialogs, CONFIRM } from './dialogs'

const dialog = (id: string) => document.getElementById(id) as HTMLDialogElement

describe('bindDialogs', () => {
  let dispose: () => void = () => undefined
  const onOpen = vi.fn()

  beforeEach(() => {
    mountPage()
    onOpen.mockClear()
  })

  afterEach(() => {
    dispose()
    vi.unstubAllGlobals()
  })

  function start(test = playing()) {
    const dialogs = bindDialogs(document, test.store, onOpen)
    dispose = dialogs.dispose
    return { test, dialogs }
  }

  it('reveals the solution only on confirm', () => {
    const { test, dialogs } = start()
    dialogs.confirmReveal()
    expect(dialog('reveal-dialog').open).toBe(true)
    expect(onOpen).toHaveBeenCalled()
    dialog('reveal-dialog').close('cancel')
    expect(test.state().pending).toBeNull()
    dialogs.confirmReveal()
    dialog('reveal-dialog').close(CONFIRM)
    expect(test.state().pending?.task).toBe('solve')
  })

  it('abandons the game for the event it was asked about, once', () => {
    const { test, dialogs } = start()
    dialogs.confirmAbandon({ type: 'enterCustom' })
    dialog('abandon-dialog').close('cancel')
    expect(test.state().game.mode).toBe('playing')
    dialog('abandon-dialog').showModal()
    dialog('abandon-dialog').close(CONFIRM)
    expect(test.state().game.mode).toBe('playing')
    dialogs.confirmAbandon({ type: 'enterCustom' })
    dialog('abandon-dialog').close(CONFIRM)
    expect(test.state().game.mode).toBe('entering')
  })

  it('opens on a win with what it took, and starts the difficulty picked', () => {
    const { test } = start(playing(solvedExcept(2)))
    test.store.dispatch({ type: 'select', index: 2 as never })
    test.store.dispatch({ type: 'digit', digit: 4 })
    expect(dialog('win-dialog').open).toBe(true)
    expect(document.getElementById('win-summary')).toHaveTextContent(
      'Easy puzzle finished in 00:00 with 0 mistakes.',
    )
    dialog('win-dialog').close('close')
    expect(test.state().game.mode).toBe('won')
    test.store.dispatch({ type: 'undo' })
    test.store.dispatch({ type: 'redo' })
    expect(dialog('win-dialog').open).toBe(true)
    dialog('win-dialog').close('medium')
    expect(test.state().pending).toMatchObject({ task: 'generate', difficulty: 'medium' })
  })

  it('closes the win dialog when an undo takes the win back', () => {
    const { test } = start(playing(solvedExcept(2)))
    test.store.dispatch({ type: 'select', index: 2 as never })
    test.store.dispatch({ type: 'digit', digit: 4 })
    test.store.dispatch({ type: 'undo' })
    expect(dialog('win-dialog').open).toBe(false)
    expect(test.state().game.mode).toBe('playing')
  })

  it('accepts a shared puzzle from the state, with no decline ahead of it', () => {
    const test = harness()
    const dispatch = vi.spyOn(test.store, 'dispatch')
    start(test)
    test.store.dispatch({ type: 'opened', search: `?p=${PUZZLE}`, href: `https://x/?p=${PUZZLE}` })
    expect(dialog('pending-dialog').open).toBe(true)
    dispatch.mockClear()
    dialog('pending-dialog').close(CONFIRM)
    expect(dispatch.mock.calls.map(([event]) => event.type)).toEqual(['acceptOffer'])
    expect(test.state().game.mode).toBe('entering')
    expect(test.state().pending?.task).toBe('validate')
  })

  it('declines a shared puzzle on any other close', () => {
    const { test } = start(harness())
    test.store.dispatch({ type: 'opened', search: `?p=${PUZZLE}`, href: `https://x/?p=${PUZZLE}` })
    dialog('pending-dialog').close('cancel')
    expect(test.state().offer).toBeNull()
    expect(test.state().game.mode).toBe('selecting')
  })

  it('closes the offer quietly once the state drops it', () => {
    const test = harness()
    start(test)
    test.store.dispatch({ type: 'opened', search: `?p=${PUZZLE}`, href: `https://x/?p=${PUZZLE}` })
    const dispatch = vi.spyOn(test.store, 'dispatch')
    test.store.dispatch({ type: 'declineOffer' })
    expect(dialog('pending-dialog').open).toBe(false)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })
})
