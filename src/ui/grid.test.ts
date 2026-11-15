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

import { bindGrid, GRID_CELLS, gridTarget } from './grid'

const plain = { ctrl: false, meta: false, alt: false, shift: false }

describe('gridTarget', () => {
  it('goes to the row ends on Home and End, and the board ends with Ctrl', () => {
    expect(gridTarget(40, { ...plain, key: 'Home' })).toBe(36)
    expect(gridTarget(40, { ...plain, key: 'End' })).toBe(44)
    expect(gridTarget(40, { ...plain, key: 'Home', ctrl: true })).toBe(0)
    expect(gridTarget(40, { ...plain, key: 'End', ctrl: true })).toBe(GRID_CELLS - 1)
    expect(gridTarget(0, { ...plain, key: 'End' })).toBe(8)
  })

  it('leaves the arrows and other keys to the keymap, and ignores other modifiers', () => {
    expect(gridTarget(40, { ...plain, key: 'ArrowLeft' })).toBeNull()
    expect(gridTarget(40, { ...plain, key: '5' })).toBeNull()
    expect(gridTarget(40, { ...plain, key: 'Home', shift: true })).toBeNull()
    expect(gridTarget(40, { ...plain, key: 'Home', alt: true })).toBeNull()
    expect(gridTarget(40, { ...plain, key: 'End', meta: true })).toBeNull()
  })
})

/** The board as the markup draws it: nine rows of nine cells, the first one the tab stop. */
function mount(stop = 0) {
  const rows = Array.from(
    { length: 9 },
    (_, r) =>
      `<div role="row">${Array.from({ length: 9 }, (_, c) => {
        const index = r * 9 + c
        return `<div role="gridcell" id="cell-${String(index)}" tabindex="${index === stop ? '0' : '-1'}"></div>`
      }).join('')}</div>`,
  ).join('')
  document.body.innerHTML = `<button id="before">before</button><div role="grid" id="board">${rows}</div><button id="after">after</button>`
  const grid = document.getElementById('board')!
  const cell = (index: number) => document.getElementById(`cell-${String(index)}`)!
  return { grid, cell }
}

const press = (target: EventTarget, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

const stops = () =>
  [...document.querySelectorAll<HTMLElement>('[role="gridcell"]')].filter((c) => c.tabIndex === 0)

describe('bindGrid', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('starts from the tab stop the markup gave, or the first cell', () => {
    expect(bindGrid(mount(40).grid, { onSelect: vi.fn() }).active()).toBe(40)
    const { grid, cell } = mount()
    cell(0).tabIndex = -1
    expect(bindGrid(grid, { onSelect: vi.fn() }).active()).toBe(0)
  })

  it('moves the one tab stop and focus on Home and End, and reports the cell', () => {
    const { grid, cell } = mount()
    const onSelect = vi.fn()
    const handle = bindGrid(grid, { onSelect })
    handle.focus(40)
    expect(onSelect).not.toHaveBeenCalled()
    expect(press(cell(40), 'End').defaultPrevented).toBe(true)
    expect(cell(44)).toHaveFocus()
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(44)
    press(cell(44), 'Home', { ctrlKey: true })
    expect(cell(0)).toHaveFocus()
    expect(stops()).toEqual([cell(0)])
    expect(handle.active()).toBe(0)
  })

  it('leaves the arrows to the keymap, and keys off the board alone', () => {
    const { grid, cell } = mount()
    const onSelect = vi.fn()
    bindGrid(grid, { onSelect })
    expect(press(cell(0), 'ArrowRight').defaultPrevented).toBe(false)
    expect(press(grid, 'End').defaultPrevented).toBe(false)
    const text = document.createTextNode('7')
    grid.append(text)
    expect(press(text, 'End').defaultPrevented).toBe(false)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('reports a cell that focus reaches by Tab or pointer, and takes the tab stop', () => {
    const { grid, cell } = mount()
    const onSelect = vi.fn()
    bindGrid(grid, { onSelect })
    cell(30).focus()
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(30)
    expect(stops()).toEqual([cell(30)])
    grid.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('moves the tab stop alone, and ignores a cell past the board', () => {
    const { grid, cell } = mount()
    const handle = bindGrid(grid, { onSelect: vi.fn() })
    handle.setActive(12)
    expect(stops()).toEqual([cell(12)])
    handle.setActive(GRID_CELLS)
    expect(handle.active()).toBe(12)
  })

  it('reports leaving once focus settles outside the board, and not between cells', () => {
    vi.useFakeTimers()
    const { grid, cell } = mount()
    const onLeave = vi.fn()
    bindGrid(grid, { onSelect: vi.fn(), onLeave })
    cell(0).focus()
    cell(1).focus()
    vi.runAllTimers()
    expect(onLeave).not.toHaveBeenCalled()
    document.getElementById('after')!.focus()
    vi.runAllTimers()
    expect(onLeave).toHaveBeenCalledOnce()
  })

  it('leaves quietly without a listener, and stops once disposed', () => {
    vi.useFakeTimers()
    const { grid, cell } = mount()
    const onSelect = vi.fn()
    const handle = bindGrid(grid, { onSelect })
    cell(0).focus()
    document.getElementById('after')!.focus()
    expect(() => vi.runAllTimers()).not.toThrow()
    const onLeave = vi.fn()
    const second = bindGrid(grid, { onSelect, onLeave })
    cell(5).focus()
    document.getElementById('after')!.focus()
    second.dispose()
    handle.dispose()
    vi.runAllTimers()
    expect(onLeave).not.toHaveBeenCalled()
    onSelect.mockClear()
    cell(3).focus()
    expect(onSelect).not.toHaveBeenCalled()
  })
})
