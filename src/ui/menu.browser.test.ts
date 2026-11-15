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

import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { applyBuiltStyles } from '../test/built-page'
import { bindMenu, MENU_GAP_PX, type MenuHandle } from './menu'

// Placement in WebKit lands 2 to 4px off the other engines, as the native report measured.
const SLACK_PX = 6

function mount(anchored?: boolean) {
  document.body.innerHTML = `
    <div style="display:flex;justify-content:flex-end;padding:8px">
      <button id="share-button" class="[anchor-name:--share-button]" popovertarget="share-menu"
        aria-haspopup="menu" aria-expanded="false">Share</button>
      <div id="share-menu" popover="auto" role="menu" aria-labelledby="share-button"
        class="menu [position-anchor:--share-button]" data-align="end">
        <button type="button" role="menuitem" tabindex="-1" class="menu-item">Copy puzzle link</button>
        <button type="button" role="menuitem" tabindex="-1" class="menu-item">Copy board as text</button>
      </div>
      <a id="after" href="#after">after</a>
    </div>
    <div style="position:fixed;bottom:16px;left:120px">
      <button id="new-button" class="[anchor-name:--new-button]" popovertarget="new-menu"
        aria-haspopup="menu" aria-expanded="false">New Puzzle</button>
      <div id="new-menu" popover="auto" role="menu" aria-labelledby="new-button"
        class="menu [position-anchor:--new-button]">
        ${['Easy', 'Medium', 'Hard', 'Expert', 'Extreme']
          .map(
            (l) =>
              `<button type="button" role="menuitem" tabindex="-1" class="menu-item">${l}</button>`,
          )
          .join('')}
      </div>
    </div>
    <div id="outside" style="height:200px">outside</div>`
  const options = anchored === undefined ? {} : { anchored }
  const handles = [...document.querySelectorAll<HTMLElement>('[role="menu"]')].map((menu) =>
    bindMenu(menu, options),
  )
  const byId = (id: string) => document.getElementById(id)!
  const items = (id: string) => [...byId(id).querySelectorAll<HTMLElement>('[role="menuitem"]')]
  return { handles, byId, items }
}

const settled = (element: Element) =>
  Promise.all(element.getAnimations().map((animation) => animation.finished))

const isOpen = (menu: HTMLElement) => menu.matches(':popover-open')
const focused = () => document.activeElement

describe('the menu button in a real engine', () => {
  let handles: MenuHandle[] = []

  beforeAll(() => {
    applyBuiltStyles()
  })

  afterEach(() => {
    for (const handle of handles) handle.close()
    for (const handle of handles) handle.dispose()
    document.body.innerHTML = ''
  })

  it('opens on click at the first item and keeps aria-expanded in step', async () => {
    const view = mount()
    handles = view.handles
    const button = view.byId('share-button')
    await userEvent.click(button)
    await expect.poll(focused).toBe(view.items('share-menu')[0])
    expect(isOpen(view.byId('share-menu'))).toBe(true)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => button.getAttribute('aria-expanded')).toBe('false')
    expect(isOpen(view.byId('share-menu'))).toBe(false)
    expect(focused()).toBe(button)
  })

  it('opens at the last item on ArrowUp and moves by arrows, Home, End and letters', async () => {
    const view = mount()
    handles = view.handles
    const levels = view.items('new-menu')
    view.byId('new-button').focus()
    await userEvent.keyboard('{ArrowUp}')
    await expect.poll(focused).toBe(levels[4])
    await userEvent.keyboard('{ArrowDown}')
    expect(focused()).toBe(levels[0])
    await userEvent.keyboard('{End}')
    expect(focused()).toBe(levels[4])
    await userEvent.keyboard('{Home}')
    expect(focused()).toBe(levels[0])
    await userEvent.keyboard('e')
    expect(focused()).toBe(levels[3])
    await userEvent.keyboard('e')
    expect(focused()).toBe(levels[4])
    await userEvent.keyboard('e')
    expect(focused()).toBe(levels[0])
  })

  it('closes on Tab and lets focus move on', async () => {
    const view = mount()
    handles = view.handles
    await userEvent.click(view.byId('share-button'))
    await expect.poll(focused).toBe(view.items('share-menu')[0])
    await userEvent.tab()
    await expect.poll(() => isOpen(view.byId('share-menu'))).toBe(false)
    expect(focused()).toBe(view.byId('after'))
  })

  it('closes on choosing an item, and on a click outside', async () => {
    const view = mount()
    handles = view.handles
    const button = view.byId('share-button')
    await userEvent.click(button)
    await expect.poll(focused).toBe(view.items('share-menu')[0])
    await userEvent.click(view.items('share-menu')[1])
    await expect.poll(() => button.getAttribute('aria-expanded')).toBe('false')
    expect(focused()).toBe(button)
    await userEvent.click(button)
    await expect.poll(() => isOpen(view.byId('share-menu'))).toBe(true)
    await userEvent.click(view.byId('outside'))
    await expect.poll(() => isOpen(view.byId('share-menu'))).toBe(false)
  })

  it('sits in the top layer, above a fixed layer of the page', async () => {
    const view = mount()
    handles = view.handles
    const cover = document.createElement('div')
    cover.style.cssText = 'position:fixed;inset:0;z-index:2147483647'
    await userEvent.click(view.byId('share-button'))
    await expect.poll(focused).toBe(view.items('share-menu')[0])
    document.body.append(cover)
    const box = view.byId('share-menu').getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    expect(view.byId('share-menu').contains(hit)).toBe(true)
  })

  it.each([
    ['anchor positioning', undefined],
    ['the script fallback', false],
  ])('places the menus by %s', async (_, anchored) => {
    const view = mount(anchored)
    handles = view.handles
    const share = view.byId('share-button')
    await userEvent.click(share)
    await expect.poll(focused).toBe(view.items('share-menu')[0])
    await settled(view.byId('share-menu'))
    const button = share.getBoundingClientRect()
    const menu = view.byId('share-menu').getBoundingClientRect()
    expect(Math.abs(menu.top - button.bottom - MENU_GAP_PX)).toBeLessThanOrEqual(SLACK_PX)
    expect(Math.abs(menu.right - button.right)).toBeLessThanOrEqual(SLACK_PX)
    view.handles[0].close()
    const opener = view.byId('new-button')
    await userEvent.click(opener)
    await expect.poll(focused).toBe(view.items('new-menu')[0])
    await settled(view.byId('new-menu'))
    const low = opener.getBoundingClientRect()
    const flipped = view.byId('new-menu').getBoundingClientRect()
    expect(Math.abs(low.top - flipped.bottom - MENU_GAP_PX)).toBeLessThanOrEqual(SLACK_PX)
    const centre = (rect: DOMRect) => rect.left + rect.width / 2
    expect(Math.abs(centre(flipped) - centre(low))).toBeLessThanOrEqual(SLACK_PX)
  })
})
