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
import {
  createToaster,
  FLOOR_GAP_PX,
  TOAST_DURATION_MS,
  TOAST_UNMOUNT_MS,
  WIDE_QUERY,
} from './toast'

const VIEWPORT_HEIGHT = 900
const FLOOR_TOP = 700

/** A media query list whose answer a test flips, firing change as a real one does. */
function media(matches = false) {
  const list = Object.assign(new EventTarget(), { matches })
  return {
    list: list as unknown as MediaQueryList,
    flip: (to: boolean) => {
      list.matches = to
      list.dispatchEvent(new Event('change'))
    },
  }
}

/** Captures what the toaster observes, since jsdom has no ResizeObserver. */
function observers() {
  const made: { callback: () => void; observed: Element[]; disconnect: () => void }[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observed: Element[] = []
      callback: () => void
      disconnect = vi.fn()
      constructor(callback: () => void) {
        this.callback = callback
        made.push(this)
      }
      observe(element: Element) {
        this.observed.push(element)
      }
    },
  )
  return made
}

/** A host whose popover methods are stubs, the same in jsdom and in an engine. */
function mount() {
  document.body.innerHTML = `
    <dialog id="d"><button>inside</button></dialog>
    <div data-toast-floor hidden></div>
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
  const made = observers()
  const wide = media()
  return { host, dialog, state, show, hide, made, wide }
}

const items = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('.toast')]
const texts = (host: HTMLElement) => items(host).map((item) => item.textContent)

describe('createToaster', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('shows a message in the top layer, lets it go after its duration and unmounts it later', () => {
    const { host, state, wide } = mount()
    const toaster = createToaster(host, { wide: wide.list })
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
    vi.advanceTimersByTime(TOAST_UNMOUNT_MS - 1)
    expect(item.isConnected).toBe(true)
    vi.advanceTimersByTime(1)
    expect(item.isConnected).toBe(false)
    expect(state.open).toBe(false)
    expect(host.style.getPropertyValue('--front-height')).toBe('0px')
  })

  it.each([
    ['success', '#i-toast-success'],
    ['error', '#i-toast-error'],
    ['info', '#i-toast-info'],
  ] as const)('draws the %s status icon before the message', (tone, href) => {
    const { host, wide } = mount()
    const toaster = createToaster(host, { wide: wide.list })
    const item = toaster.show('Board imported.', { tone })
    expect(item).toHaveAttribute('data-tone', tone)
    const [box, text] = item.children
    expect(box).toHaveClass('toast-icon')
    expect(box.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(box.querySelector('use')).toHaveAttribute('href', href)
    expect(text).toHaveClass('toast-message')
  })

  it('drops the tone and its icon when a toast of the same id comes back without one', () => {
    const { host, wide } = mount()
    const toaster = createToaster(host, { wide: wide.list })
    const item = toaster.show('Copied', { id: 'copy', tone: 'success' })
    toaster.show('Copied', { id: 'copy' })
    expect(item).not.toHaveAttribute('data-tone')
    expect(item.querySelector('.toast-icon')).toBeNull()
  })

  it('keeps earlier toasts as a stack behind the newest, as sonner does', () => {
    const { host, state, wide } = mount()
    const toaster = createToaster(host, { wide: wide.list })
    const first = toaster.show('Board imported from clipboard.', { duration: 10 })
    vi.advanceTimersByTime(5)
    const second = toaster.show('Puzzle is valid and has a unique solution.', { duration: 20 })
    expect(texts(host)).toEqual([
      'Puzzle is valid and has a unique solution.',
      'Board imported from clipboard.',
    ])
    expect(second).not.toHaveAttribute('data-behind')
    expect(first).toHaveAttribute('data-behind')
    expect(second).toHaveStyle({ zIndex: '2' })
    expect(first).toHaveStyle({ zIndex: '1' })
    expect(first.style.getPropertyValue('--index')).toBe('1')
    vi.advanceTimersByTime(5 + TOAST_UNMOUNT_MS)
    expect(items(host)).toEqual([second])
    expect(second).toHaveStyle({ zIndex: '1' })
    expect(state.open).toBe(true)
  })

  it("sizes the stack from sonner's height record and draws only the newest three", () => {
    const { host, wide } = mount()
    // Each message is the height its box reports, since jsdom lays nothing out.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return { height: Number(this.textContent) } as DOMRect
    })
    const toaster = createToaster(host, { wide: wide.list })
    for (const height of [10, 20, 30, 40]) {
      toaster.show(String(height), { id: String(height), duration: Infinity })
    }
    const read = (name: string) => items(host).map((item) => item.style.getPropertyValue(name))
    const front = () => host.style.getPropertyValue('--front-height')
    expect(texts(host)).toEqual(['40', '30', '20', '10'])
    expect(front()).toBe('40px')
    expect(read('--offset')).toEqual(['0px', '54px', '98px', '132px'])
    expect(items(host).map((item) => item.hasAttribute('data-behind'))).toEqual([
      false,
      true,
      true,
      true,
    ])
    expect(items(host).map((item) => item.hasAttribute('data-buried'))).toEqual([
      false,
      false,
      false,
      true,
    ])
    const forced = items(host)[1]
    forced.style.height = '5px'
    wide.flip(true)
    expect(front()).toBe('10px')
    expect(read('--offset')).toEqual(['102px', '58px', '24px', '0px'])
    expect(forced).toHaveStyle({ height: '5px' })
    toaster.dismiss('10')
    vi.advanceTimersByTime(TOAST_UNMOUNT_MS)
    expect(front()).toBe('20px')
    toaster.show('35', { id: '30', duration: Infinity })
    expect(front()).toBe('20px')
    expect(read('--offset')).toEqual(['83px', '34px', '0px'])
  })

  it('reads the wide layout from its media query by default', () => {
    const { host, wide } = mount()
    const matchMedia = vi.fn(() => wide.list)
    vi.stubGlobal('matchMedia', matchMedia)
    createToaster(host).show('first', { duration: 10 })
    expect(matchMedia).toHaveBeenCalledWith(WIDE_QUERY)
    vi.advanceTimersByTime(10)
    wide.flip(true)
    expect(items(host)[0]).not.toHaveAttribute('data-leaving')
  })

  it('restarts every timer and shows a leaving toast again when the layout flips', () => {
    const { host, wide } = mount()
    const toaster = createToaster(host, { wide: wide.list })
    const old = toaster.show('Puzzle link copied to clipboard.', { duration: 100 })
    vi.advanceTimersByTime(50)
    const kept = toaster.show('Board exported to clipboard.', { duration: 100 })
    vi.advanceTimersByTime(50)
    expect(old).toHaveAttribute('data-leaving')
    wide.flip(true)
    expect(old).not.toHaveAttribute('data-leaving')
    vi.advanceTimersByTime(90)
    expect(kept).not.toHaveAttribute('data-leaving')
    expect(old.isConnected).toBe(true)
    vi.advanceTimersByTime(10)
    expect(kept).toHaveAttribute('data-leaving')
    vi.advanceTimersByTime(TOAST_UNMOUNT_MS - 100)
    expect(old.isConnected).toBe(false)
  })

  it('replaces a toast of the same id, even one already leaving', () => {
    const { host, wide } = mount()
    const toaster = createToaster(host, { wide: wide.list })
    const first = toaster.show('Copied', { id: 'copy', duration: 10 })
    vi.advanceTimersByTime(10)
    expect(first).toHaveAttribute('data-leaving')
    const again = toaster.show('Copied again', { id: 'copy', duration: 1000 })
    expect(again).toBe(first)
    expect(again).not.toHaveAttribute('data-leaving')
    vi.advanceTimersByTime(TOAST_UNMOUNT_MS)
    expect(again.isConnected).toBe(true)
    expect(texts(host)).toEqual(['Copied again'])
    expect(toaster.show('other', { id: 'other' })).not.toBe(first)
  })

  it('runs an action once and lets the toast go', () => {
    const { host, wide } = mount()
    const run = vi.fn()
    const toaster = createToaster(host, { wide: wide.list })
    const item = toaster.show('Board cleared.', { action: { label: TOAST_ACTIONS.undo, run } })
    const undo = item.querySelector<HTMLButtonElement>('button.toast-action')!
    expect(undo).toHaveTextContent('Undo')
    expect(undo.type).toBe('button')
    undo.click()
    expect(run).toHaveBeenCalledOnce()
    expect(item).toHaveAttribute('data-leaving')
    vi.advanceTimersByTime(TOAST_UNMOUNT_MS)
    expect(item.isConnected).toBe(false)
  })

  it('keeps a persistent toast until its close button', () => {
    const { host, wide } = mount()
    const toaster = createToaster(host, { wide: wide.list })
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
    host.dispatchEvent(new Event('pointerleave'))
    vi.advanceTimersByTime(TOAST_DURATION_MS * 10)
    expect(item.isConnected).toBe(true)
    close.click()
    vi.advanceTimersByTime(TOAST_UNMOUNT_MS)
    expect(item.isConnected).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('spreads and pauses the whole stack while hovered or focused, then counts again', () => {
    const { host, wide } = mount()
    const toaster = createToaster(host, { wide: wide.list })
    const first = toaster.show('first', { duration: 100 })
    const item = toaster.show('Undo?', { duration: 100 })
    vi.advanceTimersByTime(90)
    host.dispatchEvent(new Event('pointerenter'))
    expect(host).toHaveAttribute('data-expanded')
    const late = toaster.show('late', { duration: 100 })
    vi.advanceTimersByTime(500)
    expect([first, item, late].map((toast) => toast.hasAttribute('data-leaving'))).toEqual([
      false,
      false,
      false,
    ])
    host.dispatchEvent(new Event('pointerleave'))
    expect(host).not.toHaveAttribute('data-expanded')
    vi.advanceTimersByTime(90)
    item.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(host).toHaveAttribute('data-expanded')
    vi.advanceTimersByTime(500)
    item.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: first }))
    expect(host).toHaveAttribute('data-expanded')
    vi.advanceTimersByTime(500)
    expect(item).not.toHaveAttribute('data-leaving')
    first.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }))
    expect(host).not.toHaveAttribute('data-expanded')
    vi.advanceTimersByTime(100)
    expect(item).toHaveAttribute('data-leaving')
    host.dispatchEvent(new FocusEvent('focusin'))
    item.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    expect(host).not.toHaveAttribute('data-expanded')
  })

  it('rides above the steps panel on a phone, once the panel shows and reaches into view', () => {
    const { host, made, wide } = mount()
    vi.stubGlobal('innerHeight', VIEWPORT_HEIGHT)
    const floor = document.querySelector<HTMLElement>('[data-toast-floor]')!
    const toaster = createToaster(host, { wide: wide.list })
    toaster.show('Solver finished.', { duration: Infinity })
    const lift = () => host.style.getPropertyValue('--toast-lift')
    expect(lift()).toBe('')
    expect(made[0].observed).toEqual([document.body])
    floor.getClientRects = () => [floor] as unknown as DOMRectList
    floor.getBoundingClientRect = () => ({ top: FLOOR_TOP }) as DOMRect
    made[0].callback()
    expect(lift()).toBe(`${String(VIEWPORT_HEIGHT - FLOOR_TOP + FLOOR_GAP_PX)}px`)
    floor.getBoundingClientRect = () => ({ top: VIEWPORT_HEIGHT + 1 }) as DOMRect
    globalThis.dispatchEvent(new Event('scroll'))
    expect(lift()).toBe('')
    floor.getBoundingClientRect = () => ({ top: FLOOR_TOP }) as DOMRect
    globalThis.dispatchEvent(new Event('resize'))
    expect(lift()).not.toBe('')
    wide.flip(true)
    expect(lift()).toBe('')
    toaster.dispose()
    expect(made[0].disconnect).toHaveBeenCalled()
    wide.flip(false)
    expect(lift()).toBe('')
  })

  it('stays down without a steps panel', () => {
    const { host, wide } = mount()
    document.querySelector('[data-toast-floor]')!.remove()
    createToaster(host, { wide: wide.list }).show('Board cleared.')
    expect(host.style.getPropertyValue('--toast-lift')).toBe('')
  })

  it('moves into an open dialog and back out when it closes', () => {
    const { host, dialog, show, hide, wide } = mount()
    const toaster = createToaster(host, { wide: wide.list })
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
    const { host, show, wide } = mount()
    const toaster = createToaster(host, { wide: wide.list })
    toaster.show('x', { duration: Infinity })
    host.dispatchEvent(new Event('toggle'))
    const other = document.createElement('dialog')
    document.body.append(other)
    other.dispatchEvent(new Event('close'))
    document.dispatchEvent(new Event('close'))
    expect(show).toHaveBeenCalledOnce()
  })

  it('raises into a dialog when asked, and stays hidden with nothing to show', () => {
    const { host, dialog, state, wide } = mount()
    const toaster = createToaster(host, { wide: wide.list })
    dialog.setAttribute('open', '')
    toaster.raise()
    expect(host.parentElement).toBe(dialog)
    expect(state.open).toBe(false)
  })

  it('dismisses by id, and ignores an id not on screen', () => {
    const { host, wide } = mount()
    const toaster = createToaster(host, { wide: wide.list })
    toaster.show('a', { id: 'a', duration: Infinity })
    toaster.dismiss('missing')
    expect(items(host)).toHaveLength(1)
    toaster.dismiss('a')
    toaster.dismiss('a')
    vi.advanceTimersByTime(TOAST_UNMOUNT_MS)
    expect(items(host)).toHaveLength(0)
  })

  it('stops its timers and listeners once disposed', () => {
    const { host, dialog, wide } = mount()
    const toaster = createToaster(host, { wide: wide.list })
    const item = toaster.show('stays', { duration: 10 })
    const leaving = toaster.show('leaving', { id: 'l', duration: Infinity })
    toaster.dismiss('l')
    toaster.dispose()
    vi.advanceTimersByTime(100)
    expect(item.isConnected).toBe(true)
    expect(leaving.isConnected).toBe(true)
    dialog.setAttribute('open', '')
    dialog.dispatchEvent(new Event('toggle'))
    expect(host.parentElement).toBe(document.body)
  })
})
