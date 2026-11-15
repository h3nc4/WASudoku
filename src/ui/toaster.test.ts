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

import { describe, expect, it, vi } from 'vitest'

import { NOTICES, TOAST_ACTIONS, TOASTS } from '../core/text/messages'
import type { Toaster } from './toast'
import { notifier, toastSink, updateOffer } from './toaster'

const fakeToaster = () => {
  const show = vi.fn<Toaster['show']>(() => document.createElement('li'))
  const toaster: Toaster = { show, dismiss: vi.fn(), raise: vi.fn(), dispose: vi.fn() }
  return { toaster, show }
}

describe('toastSink', () => {
  it('shows each runtime toast by its text, one at a time per id', () => {
    const { toaster, show } = fakeToaster()
    toastSink(toaster)('copyFailed', 'error')
    expect(show).toHaveBeenCalledWith(TOASTS.copyFailed, { id: 'copyFailed', tone: 'error' })
  })
})

describe('notifier', () => {
  it('offers an undo with a cleared board, and nothing with the auto-fill', () => {
    const { toaster, show } = fakeToaster()
    const undo = vi.fn()
    const notify = notifier(toaster, undo)
    notify('cleared')
    const [message, options] = show.mock.calls[0]
    expect(message).toBe(NOTICES.cleared)
    expect(options?.action?.label).toBe(TOAST_ACTIONS.undo)
    options?.action?.run()
    expect(undo).toHaveBeenCalled()
    notify('autoFilled')
    expect(show).toHaveBeenLastCalledWith(NOTICES.autoFilled, { id: 'autoFilled' })
  })
})

describe('updateOffer', () => {
  it('keeps the offer up until the player reloads into the new build', () => {
    const { toaster, show } = fakeToaster()
    const apply = vi.fn()
    updateOffer(toaster)(apply)
    const [message, options] = show.mock.calls[0]
    expect(message).toBe(NOTICES.updateAvailable)
    expect(options?.duration).toBe(Infinity)
    expect(options?.action?.label).toBe(TOAST_ACTIONS.reload)
    options?.action?.run()
    expect(apply).toHaveBeenCalled()
  })
})
