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

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  alignOf,
  bindMenu,
  MENU_EDGE_PX,
  MENU_GAP_PX,
  menuTarget,
  placeMenu,
  supportsAnchors,
} from './menu'

const VIEWPORT = { width: 400, height: 800 }
const SIZE = { width: 120, height: 200 }
const box = (top: number, left: number, width = 40, height = 40) => ({
  top,
  left,
  right: left + width,
  bottom: top + height,
})

describe('placeMenu', () => {
  it('opens below the button, lined up with its start or its end', () => {
    expect(placeMenu(box(10, 100), SIZE, VIEWPORT, 'start')).toEqual({
      top: 50 + MENU_GAP_PX,
      left: 100,
    })
    expect(placeMenu(box(10, 300), SIZE, VIEWPORT, 'end').left).toBe(340 - 120)
    expect(placeMenu(box(10, 100, 200), SIZE, VIEWPORT, 'center').left).toBe(140)
  })

  it('reads the alignment as the CSS does, centred unless an edge is named', () => {
    expect(alignOf('end')).toBe('end')
    expect(alignOf('start')).toBe('start')
    expect(alignOf(undefined)).toBe('center')
    expect(alignOf('middle')).toBe('center')
  })

  it('flips above when only that fits, and stays below when neither does', () => {
    expect(placeMenu(box(700, 100), SIZE, VIEWPORT, 'start').top).toBe(700 - MENU_GAP_PX - 200)
    expect(placeMenu(box(100, 100), { width: 120, height: 750 }, VIEWPORT, 'start').top).toBe(
      140 + MENU_GAP_PX,
    )
  })

  it('keeps clear of both side edges', () => {
    expect(placeMenu(box(10, 0), SIZE, VIEWPORT, 'end').left).toBe(MENU_EDGE_PX)
    expect(placeMenu(box(10, 380), SIZE, VIEWPORT, 'start').left).toBe(400 - 120 - MENU_EDGE_PX)
    expect(placeMenu(box(10, 380), { width: 500, height: 10 }, VIEWPORT, 'start').left).toBe(
      MENU_EDGE_PX,
    )
  })
})

describe('menuTarget', () => {
  const labels = ['Easy', 'Medium', 'Hard', 'Expert', 'Extreme']
  const key = (k: string, modified = false) => ({ key: k, modified })

  it('moves with wrapping arrows and jumps with Home and End', () => {
    expect(menuTarget(key('ArrowDown'), labels, 4)).toBe(0)
    expect(menuTarget(key('ArrowDown'), labels, -1)).toBe(0)
    expect(menuTarget(key('ArrowUp'), labels, 0)).toBe(4)
    expect(menuTarget(key('ArrowUp'), labels, 2)).toBe(1)
    expect(menuTarget(key('Home'), labels, 3)).toBe(0)
    expect(menuTarget(key('End'), labels, 0)).toBe(4)
  })

  it('cycles through the items a letter starts, from the one after focus', () => {
    expect(menuTarget(key('e'), labels, -1)).toBe(0)
    expect(menuTarget(key('E'), labels, 0)).toBe(3)
    expect(menuTarget(key('e'), labels, 3)).toBe(4)
    expect(menuTarget(key('e'), labels, 4)).toBe(0)
    expect(menuTarget(key('z'), labels, 0)).toBeNull()
  })

  it('leaves other keys, modified keys and an empty menu alone', () => {
    expect(menuTarget(key('Enter'), labels, 0)).toBeNull()
    expect(menuTarget(key(' '), labels, 0)).toBeNull()
    expect(menuTarget(key('e', true), labels, 0)).toBeNull()
    expect(menuTarget(key('ArrowDown'), [], -1)).toBeNull()
  })
})

/** A menu without the popover attribute, opened by stubs, so no engine opens it natively. */
function mount() {
  document.body.innerHTML = `
    <button id="invoker" popovertarget="m" aria-expanded="false">New</button>
    <div id="m" role="menu" data-align="end">
      <button role="menuitem" tabindex="-1">Easy</button>
      <button role="menuitem" tabindex="-1" aria-disabled="true">Medium</button>
      <button role="menuitem" tabindex="-1">Hard</button>
      <button role="menuitem" tabindex="-1">Expert</button>
    </div>
    <a href="#after">after</a>`
  const menu = document.getElementById('m')!
  const invoker = document.getElementById('invoker')!
  const fire = (type: string, newState: string) => {
    menu.dispatchEvent(Object.assign(new Event(type), { newState }))
  }
  const show = vi.fn(() => {
    fire('beforetoggle', 'open')
    fire('toggle', 'open')
  })
  const hide = vi.fn(() => {
    fire('beforetoggle', 'closed')
    fire('toggle', 'closed')
  })
  menu.showPopover = show
  menu.hidePopover = hide
  invoker.addEventListener('click', show)
  const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  return { menu, invoker, items, show, hide }
}

const press = (target: Element, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('bindMenu', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('refuses a menu no button opens', () => {
    document.body.innerHTML = '<div id="lonely" role="menu"></div>'
    expect(() => bindMenu(document.getElementById('lonely')!)).toThrow('#lonely')
  })

  it('keeps aria-expanded in step and focuses the first item on open', () => {
    const { menu, invoker, items, show, hide } = mount()
    const handle = bindMenu(menu, { anchored: true })
    expect(handle.invoker).toBe(invoker)
    show()
    expect(invoker).toHaveAttribute('aria-expanded', 'true')
    expect(items[0]).toHaveFocus()
    hide()
    expect(invoker).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens from the arrows on its button, at the last item for ArrowUp', () => {
    const { menu, invoker, items, hide } = mount()
    bindMenu(menu, { anchored: true })
    expect(press(invoker, 'ArrowUp').defaultPrevented).toBe(true)
    expect(items[3]).toHaveFocus()
    hide()
    press(invoker, 'ArrowDown')
    expect(items[0]).toHaveFocus()
    expect(press(invoker, 'ArrowDown').defaultPrevented).toBe(false)
    hide()
    expect(press(invoker, 'Enter').defaultPrevented).toBe(false)
  })

  it('moves focus by key, skipping a disabled item, and leaves other keys alone', () => {
    const { menu, items, show } = mount()
    bindMenu(menu, { anchored: true })
    show()
    expect(press(items[0], 'ArrowDown').defaultPrevented).toBe(true)
    expect(items[2]).toHaveFocus()
    press(items[2], 'End')
    expect(items[3]).toHaveFocus()
    press(items[3], 'h')
    expect(items[2]).toHaveFocus()
    expect(press(items[2], 'm').defaultPrevented).toBe(false)
    expect(press(items[2], 'e', { ctrlKey: true }).defaultPrevented).toBe(false)
    expect(press(items[2], 'e', { metaKey: true }).defaultPrevented).toBe(false)
    expect(press(items[2], 'e', { altKey: true }).defaultPrevented).toBe(false)
  })

  it('closes on Tab without holding focus, and on Esc back to its button', () => {
    const { menu, invoker, items, show, hide } = mount()
    bindMenu(menu, { anchored: true })
    show()
    expect(press(items[0], 'Tab').defaultPrevented).toBe(false)
    expect(hide).toHaveBeenCalledTimes(1)
    press(menu, 'Tab')
    expect(hide).toHaveBeenCalledTimes(1)
    show()
    expect(press(items[0], 'Escape').defaultPrevented).toBe(true)
    expect(hide).toHaveBeenCalledTimes(2)
    expect(invoker).toHaveFocus()
  })

  it('keeps focus in place on a press that opens it or lands on an enabled item', () => {
    const { menu, invoker, items, show } = mount()
    bindMenu(menu, { anchored: true })
    const down = (target: Element) => {
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      target.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(down(invoker)).toBe(true)
    show()
    expect(down(invoker)).toBe(false)
    expect(down(items[0])).toBe(true)
    expect(down(items[1])).toBe(false)
    expect(down(menu)).toBe(false)
  })

  it('closes once an enabled item is chosen, with focus back on its button', () => {
    const { menu, invoker, items, show, hide } = mount()
    bindMenu(menu, { anchored: true })
    show()
    items[1].click()
    menu.click()
    expect(hide).not.toHaveBeenCalled()
    items[2].click()
    expect(hide).toHaveBeenCalledTimes(1)
    expect(invoker).toHaveFocus()
  })

  it('places itself from script without anchor positioning, and clears that on close', () => {
    const { menu, invoker, show, hide } = mount()
    vi.spyOn(invoker, 'getBoundingClientRect').mockReturnValue(new DOMRect(300, 10, 40, 40))
    vi.spyOn(menu, 'offsetWidth', 'get').mockReturnValue(120)
    vi.spyOn(menu, 'offsetHeight', 'get').mockReturnValue(200)
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(400)
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800)
    bindMenu(menu, { anchored: false })
    menu.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'open' }))
    expect(menu).toHaveStyle({ visibility: 'hidden' })
    menu.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }))
    expect(menu).toHaveStyle({ top: '54px' })
    expect(menu).toHaveStyle({ left: '220px' })
    expect(menu).toHaveStyle({ visibility: 'visible' })
    hide()
    expect(menu).not.toHaveAttribute('style')
    menu.setAttribute('style', 'color: red;')
    show()
    expect(menu).toHaveStyle({ top: '54px' })
    hide()
    expect(menu).toHaveStyle({ color: 'rgb(255, 0, 0)' })
    expect(menu).not.toHaveStyle({ top: '54px' })
  })

  it('centres on its button unless the menu names an edge', () => {
    const { menu, invoker, show } = mount()
    delete menu.dataset['align']
    vi.spyOn(invoker, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 10, 40, 40))
    vi.spyOn(menu, 'offsetWidth', 'get').mockReturnValue(120)
    vi.spyOn(menu, 'offsetHeight', 'get').mockReturnValue(200)
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(400)
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800)
    bindMenu(menu, { anchored: false })
    show()
    expect(menu).toHaveStyle({ left: '60px' })
  })

  it('reads anchor support from CSS by default', () => {
    vi.stubGlobal('CSS', { supports: () => true })
    expect(supportsAnchors()).toBe(true)
    const { menu, show } = mount()
    bindMenu(menu)
    show()
    expect(menu).not.toHaveAttribute('style')
    vi.stubGlobal('CSS', { supports: () => false })
    expect(supportsAnchors()).toBe(false)
  })

  it('stops listening once disposed', () => {
    const { menu, invoker, show } = mount()
    bindMenu(menu, { anchored: true }).dispose()
    show()
    expect(invoker).toHaveAttribute('aria-expanded', 'false')
  })

  it('does nothing on close while shut', () => {
    const { menu, items, hide } = mount()
    bindMenu(menu, { anchored: true }).close()
    items[0].click()
    expect(hide).not.toHaveBeenCalled()
  })

  it('swaps its fallback spelling on each resize while open, and drops it on close', () => {
    const { menu, show, hide } = mount()
    bindMenu(menu, { anchored: true })
    const fallbacks = () => menu.style.getPropertyValue('position-try-fallbacks')
    window.dispatchEvent(new Event('resize'))
    expect(fallbacks()).toBe('')
    show()
    window.dispatchEvent(new Event('resize'))
    expect(fallbacks()).toBe('flip-block, flip-block')
    window.dispatchEvent(new Event('resize'))
    expect(fallbacks()).toBe('')
    window.dispatchEvent(new Event('resize'))
    hide()
    expect(fallbacks()).toBe('')
  })

  it('leaves a menu placed from script alone on resize', () => {
    const { menu, show } = mount()
    bindMenu(menu, { anchored: false })
    show()
    window.dispatchEvent(new Event('resize'))
    expect(menu.style.getPropertyValue('position-try-fallbacks')).toBe('none')
  })
})
