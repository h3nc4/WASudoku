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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TOAST_ACTIONS } from '../core/text/messages'
import { createToaster, TOAST_DURATION_MS, TOAST_LEAVE_MS } from './toast'

/** A host whose popover methods are stubs, the same in jsdom and in an engine. */
function mount() {
  document.body.innerHTML = `
    <dialog id="d"><button>inside</button></dialog>
    <section id="toasts" aria-live="polite"></section>`
  const host = document.getElementById('toasts')!
  const dialog = document.querySelector('dialog')!
  const state = { open: false }
  const show = vi.fn(() => {
    state.open = true
  })
  const hide = vi.fn(() => {
    state.open = false
  })
  host.showPopover = show
  host.hidePopover = hide
  return { host, dialog, state, show, hide }
}

const items = (host: HTMLElement) => [...host.querySelectorAll('.toast')]

describe('createToaster', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('shows a message in the top layer and lets it go after its duration', () => {
    const { host, state } = mount()
    const toaster = createToaster(host, { reducedMotion: () => false })
    const item = toaster.show('Board cleared.')
    expect(item).toHaveTextContent('Board cleared.')
    expect(item).not.toHaveAttribute('data-tone')
    expect(item.querySelector('.toast-icon')).toBeNull()
    expect(item).toHaveAttribute('role', 'status')
    expect(item).toHaveAttribute('aria-atomic', 'true')
    expect(item.querySelector('button')).toBeNull()
    expect(state.open).toBe(true)
    vi.advanceTimersByTime(TOAST_DURATION_MS - 1)
    expect(item).not.toHaveAttribute('data-leaving')
    vi.advanceTimersByTime(1)
    expect(item).toHaveAttribute('data-leaving')
    item.dispatchEvent(new Event('transitionend'))
    expect(item.isConnected).toBe(false)
    expect(state.open).toBe(false)
    vi.advanceTimersByTime(TOAST_LEAVE_MS)
    expect(items(host)).toHaveLength(0)
  })

  it.each([
    ['success', '#i-toast-success'],
    ['error', '#i-toast-error'],
    ['info', '#i-toast-info'],
  ] as const)('draws the %s status icon before the message', (tone, href) => {
    const { host } = mount()
    const toaster = createToaster(host)
    const item = toaster.show('Board imported.', { tone })
    expect(item).toHaveAttribute('data-tone', tone)
    const [box, text] = item.children
    expect(box).toHaveClass('toast-icon')
    expect(box.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(box.querySelector('use')).toHaveAttribute('href', href)
    expect(text).toHaveClass('toast-message')
  })

  it('drops the tone and its icon when a toast of the same id comes back without one', () => {
    const { host } = mount()
    const toaster = createToaster(host)
    const item = toaster.show('Copied', { id: 'copy', tone: 'success' })
    toaster.show('Copied', { id: 'copy' })
    expect(item).not.toHaveAttribute('data-tone')
    expect(item.querySelector('.toast-icon')).toBeNull()
  })

  it('removes a leaving toast whose transition never ends', () => {
    const { host } = mount()
    const toaster = createToaster(host, { reducedMotion: () => false })
    const item = toaster.show('Saved', { duration: 10 })
    vi.advanceTimersByTime(10 + TOAST_LEAVE_MS)
    expect(item.isConnected).toBe(false)
  })

  it('removes at once under reduced motion, keeping the others', () => {
    const { host, state } = mount()
    const toaster = createToaster(host, { reducedMotion: () => true })
    toaster.show('first', { duration: 10 })
    const second = toaster.show('second', { duration: 20, tone: 'error' })
    vi.advanceTimersByTime(10)
    expect(items(host)).toEqual([second])
    expect(state.open).toBe(true)
    expect(second).toHaveAttribute('data-tone', 'error')
  })

  it('reads reduced motion from the media query by default', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const { host } = mount()
    createToaster(host).show('gone', { duration: 5 })
    vi.advanceTimersByTime(5)
    expect(items(host)).toHaveLength(0)
  })

  it('replaces a toast of the same id, even one already leaving', () => {
    const { host } = mount()
    const toaster = createToaster(host, { reducedMotion: () => false })
    const first = toaster.show('Copied', { id: 'copy', duration: 10 })
    vi.advanceTimersByTime(10)
    expect(first).toHaveAttribute('data-leaving')
    const again = toaster.show('Copied again', { id: 'copy', duration: 1000 })
    expect(again).toBe(first)
    expect(again).not.toHaveAttribute('data-leaving')
    vi.advanceTimersByTime(TOAST_LEAVE_MS)
    expect(again.isConnected).toBe(true)
    expect(items(host).map((item) => item.textContent)).toEqual(['Copied again'])
    expect(toaster.show('other', { id: 'other' })).not.toBe(first)
  })

  it('runs an action once and lets the toast go', () => {
    const { host } = mount()
    const run = vi.fn()
    const toaster = createToaster(host, { reducedMotion: () => true })
    const item = toaster.show('Board cleared.', { action: { label: TOAST_ACTIONS.undo, run } })
    const undo = item.querySelector<HTMLButtonElement>('button.toast-action')!
    expect(undo).toHaveTextContent('Undo')
    expect(undo.type).toBe('button')
    undo.click()
    expect(run).toHaveBeenCalledOnce()
    expect(item.isConnected).toBe(false)
  })

  it('keeps a persistent toast until its close button', () => {
    const { host } = mount()
    const toaster = createToaster(host, { reducedMotion: () => true })
    const reload = vi.fn()
    const item = toaster.show('Update available', {
      id: 'update',
      duration: Infinity,
      action: { label: TOAST_ACTIONS.reload, run: reload },
    })
    vi.advanceTimersByTime(TOAST_DURATION_MS * 10)
    expect(item.isConnected).toBe(true)
    const close = item.querySelector<HTMLButtonElement>('button.toast-close')!
    expect(close).toHaveAccessibleName(TOAST_ACTIONS.close)
    expect(close.querySelector('use')).toHaveAttribute('href', '#i-x')
    expect(close.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    item.dispatchEvent(new Event('pointerleave'))
    vi.advanceTimersByTime(TOAST_DURATION_MS * 10)
    expect(item.isConnected).toBe(true)
    close.click()
    expect(item.isConnected).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('waits while hovered or focused, then counts the whole duration again', () => {
    const { host } = mount()
    const toaster = createToaster(host, { reducedMotion: () => true })
    const item = toaster.show('Undo?', { duration: 100 })
    vi.advanceTimersByTime(90)
    item.dispatchEvent(new Event('pointerenter'))
    vi.advanceTimersByTime(500)
    expect(item.isConnected).toBe(true)
    item.dispatchEvent(new Event('pointerleave'))
    vi.advanceTimersByTime(90)
    item.dispatchEvent(new FocusEvent('focusin'))
    vi.advanceTimersByTime(500)
    expect(item.isConnected).toBe(true)
    item.dispatchEvent(new FocusEvent('focusout'))
    vi.advanceTimersByTime(100)
    expect(item.isConnected).toBe(false)
  })

  it('moves into an open dialog and back out when it closes', () => {
    const { host, dialog, show, hide } = mount()
    const toaster = createToaster(host, { reducedMotion: () => true })
    toaster.show('outside', { duration: Infinity })
    expect(host.parentElement).toBe(document.body)
    dialog.setAttribute('open', '')
    dialog.dispatchEvent(new Event('toggle'))
    expect(host.parentElement).toBe(dialog)
    expect(hide).toHaveBeenCalled()
    expect(show).toHaveBeenCalledTimes(2)
    dialog.removeAttribute('open')
    dialog.dispatchEvent(new Event('close'))
    expect(host.parentElement).toBe(document.body)
    expect(show).toHaveBeenCalledTimes(3)
  })

  it('ignores toggles of other elements and closes of dialogs elsewhere', () => {
    const { host, show } = mount()
    const toaster = createToaster(host, { reducedMotion: () => true })
    toaster.show('x', { duration: Infinity })
    host.dispatchEvent(new Event('toggle'))
    const other = document.createElement('dialog')
    document.body.append(other)
    other.dispatchEvent(new Event('close'))
    document.dispatchEvent(new Event('close'))
    expect(show).toHaveBeenCalledOnce()
  })

  it('raises into a dialog when asked, and stays hidden with nothing to show', () => {
    const { host, dialog, state } = mount()
    const toaster = createToaster(host)
    dialog.setAttribute('open', '')
    toaster.raise()
    expect(host.parentElement).toBe(dialog)
    expect(state.open).toBe(false)
  })

  it('dismisses by id, and ignores an id not on screen', () => {
    const { host } = mount()
    const toaster = createToaster(host, { reducedMotion: () => true })
    toaster.show('a', { id: 'a', duration: Infinity })
    toaster.dismiss('missing')
    expect(items(host)).toHaveLength(1)
    toaster.dismiss('a')
    expect(items(host)).toHaveLength(0)
  })

  it('stops its timers and listeners once disposed', () => {
    const { host, dialog } = mount()
    const toaster = createToaster(host, { reducedMotion: () => true })
    const item = toaster.show('stays', { duration: 10 })
    toaster.dispose()
    vi.advanceTimersByTime(100)
    expect(item.isConnected).toBe(true)
    dialog.setAttribute('open', '')
    dialog.dispatchEvent(new Event('toggle'))
    expect(host.parentElement).toBe(document.body)
  })
})
