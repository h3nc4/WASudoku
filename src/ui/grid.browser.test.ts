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
import { userEvent } from 'vitest/browser'

import { bindGrid, GRID_CELLS, type GridHandle } from './grid'

function mount() {
  const rows = Array.from(
    { length: 9 },
    (_, r) =>
      `<div role="row" style="display:flex">${Array.from({ length: 9 }, (_, c) => {
        const index = r * 9 + c
        return `<div role="gridcell" id="cell-${String(index)}" tabindex="${index === 0 ? '0' : '-1'}" aria-label="cell" style="width:24px;height:24px"></div>`
      }).join('')}</div>`,
  ).join('')
  document.body.innerHTML = `<button id="before">before</button><div role="grid" id="board" aria-label="Sudoku board">${rows}</div><button id="after">after</button>`
  return {
    grid: document.getElementById('board')!,
    cell: (index: number) => document.getElementById(`cell-${String(index)}`)!,
    byId: (id: string) => document.getElementById(id)!,
  }
}

describe('the board grid in a real engine', () => {
  let handle: GridHandle | undefined

  afterEach(() => {
    handle?.dispose()
    document.body.innerHTML = ''
  })

  it('is one tab stop, which Tab enters and leaves', async () => {
    const { grid, cell, byId } = mount()
    const onSelect = vi.fn()
    const onLeave = vi.fn()
    handle = bindGrid(grid, { onSelect, onLeave })
    handle.setActive(40)
    byId('before').focus()
    await userEvent.tab()
    expect(cell(40)).toHaveFocus()
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(40)
    await userEvent.tab()
    expect(byId('after')).toHaveFocus()
    await expect.poll(() => onLeave.mock.calls.length).toBe(1)
  })

  it('moves on Home, End and their Ctrl forms, and lets the arrows through', async () => {
    const { grid, cell } = mount()
    const onSelect = vi.fn()
    handle = bindGrid(grid, { onSelect })
    handle.focus(40)
    await userEvent.keyboard('{End}')
    expect(cell(44)).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(cell(36)).toHaveFocus()
    await userEvent.keyboard('{Control>}{End}{/Control}')
    expect(cell(GRID_CELLS - 1)).toHaveFocus()
    await userEvent.keyboard('{Control>}{Home}{/Control}')
    expect(cell(0)).toHaveFocus()
    expect(onSelect.mock.calls).toEqual([[44], [36], [80], [0]])
    await userEvent.keyboard('{ArrowRight}')
    expect(cell(0)).toHaveFocus()
    expect(grid.querySelectorAll('[tabindex="0"]')).toHaveLength(1)
  })

  it('takes the tab stop where a pointer puts focus', async () => {
    const { grid, cell } = mount()
    const onSelect = vi.fn()
    handle = bindGrid(grid, { onSelect })
    await userEvent.click(cell(22))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(22)
    expect(cell(22).tabIndex).toBe(0)
    expect(cell(0).tabIndex).toBe(-1)
  })
})
