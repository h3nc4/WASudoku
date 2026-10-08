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

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StickyToggle } from '@/components/controls/StickyToggle'
import { generatePuzzleSuccess, pauseGame } from '@/context/sudoku.actions'
import type { SudokuAction } from '@/context/sudoku.actions.types'
import { useSudokuDispatch } from '@/context/sudoku.hooks'
import { SudokuProvider } from '@/context/SudokuProvider'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

import { NumberPad } from './NumberPad'
import { SudokuGrid } from './SudokuGrid'

vi.mock('@/hooks/useSudokuPersistence')
vi.mock('@/hooks/useSudokuSolver')
vi.mock('@/hooks/useSudokuFeedback')
vi.mock('@/hooks/useGameTimer')

// A valid solved grid. Cell 0 holds 1, cell 1 holds 2, and the puzzle gives every 9 but the first.
const solution = Array.from({ length: 81 }, (_, i) => {
  const r = Math.floor(i / 9)
  return ((r * 3 + Math.floor(r / 3) + (i % 9)) % 9) + 1
})
const nines = solution.flatMap((v, i) => (v === 9 ? [i] : []))
const givens = new Set([1, ...nines.slice(1)])
const puzzle = solution.map((v, i) => (givens.has(i) ? String(v) : '.')).join('')

const cell = (index: number) =>
  screen.getByLabelText(
    `Sudoku cell at row ${Math.floor(index / 9) + 1}, column ${(index % 9) + 1}`,
  )
const key = (digit: number) => screen.getByRole('button', { name: `Enter number ${digit}` })
// A removed note lingers hidden while it fades, so only the notes still shown count.
const notes = (index: number) =>
  [...(cell(index).parentElement?.querySelectorAll('.text-note:not([aria-hidden])') ?? [])].map(
    (note) => note.textContent,
  )
const toggle = () => screen.getByRole('button', { name: 'Sticky numbers' })

describe('sticky numbers on the board', () => {
  let dispatch: (action: SudokuAction) => void = () => {}

  const Harness = () => {
    const sudokuDispatch = useSudokuDispatch()
    useKeyboardShortcuts()
    useEffect(() => {
      dispatch = sudokuDispatch
    }, [sudokuDispatch])
    return (
      <>
        <SudokuGrid />
        <StickyToggle />
        <NumberPad />
      </>
    )
  }

  beforeEach(() => {
    vi.spyOn(globalThis.localStorage.__proto__, 'getItem').mockReturnValue(null)
  })

  const start = () => {
    render(
      <SudokuProvider>
        <Harness />
      </SudokuProvider>,
    )
    act(() => dispatch(generatePuzzleSuccess(puzzle, solution.join(''))))
    return userEvent.setup()
  }

  it('leaves a tap as a plain selection with the mode off', async () => {
    const user = start()
    await user.click(key(1))
    await user.click(cell(0))
    expect(cell(0)).toHaveValue('')
    expect(key(1)).not.toHaveAttribute('aria-pressed')
  })

  it('applies the locked digit to each tapped cell and shades its cells', async () => {
    const user = start()
    await user.click(toggle())
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
    await user.click(key(1))
    expect(key(1)).toHaveAttribute('aria-pressed', 'true')

    await user.click(cell(0))
    await user.click(cell(12))
    expect(cell(0)).toHaveValue('1')
    expect(cell(12)).toHaveValue('1')
    expect(cell(0).parentElement?.querySelector('.bg-same')).not.toBeNull()

    await user.click(cell(0))
    expect(cell(0)).toHaveValue('')
  })

  it('never places on arrow navigation, while a typed digit still goes to the selected cell', async () => {
    const user = start()
    await user.click(toggle())
    await user.click(key(1))
    await user.click(cell(0))
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(cell(18)).toHaveFocus()
    expect(cell(9)).toHaveValue('')
    expect(cell(18)).toHaveValue('')

    await user.keyboard('3')
    expect(cell(18)).toHaveValue('3')
    expect(key(1)).toHaveAttribute('aria-pressed', 'true')
  })

  it('only selects a given', async () => {
    const user = start()
    await user.click(toggle())
    await user.click(key(5))
    await user.click(cell(1))
    expect(cell(1)).toHaveValue('2')
    expect(cell(1)).toHaveFocus()
  })

  it('toggles a note in a note mode', async () => {
    const user = start()
    await user.click(toggle())
    await user.click(key(4))
    await user.click(cell(1))
    await user.keyboard('n')
    await user.click(cell(41))
    expect(notes(41)).toEqual(['4'])
    await user.click(cell(41))
    expect(notes(41)).toEqual([])
    expect(cell(41)).toHaveValue('')
  })

  it('releases the lock once its digit is complete', async () => {
    const user = start()
    await user.click(toggle())
    await user.click(key(9))
    await user.click(cell(nines[0]))
    expect(key(9)).toHaveAttribute('data-complete')
    expect(key(9)).toHaveAttribute('aria-pressed', 'false')
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
  })

  it('toggles on S and releases the lock on Escape', async () => {
    const user = start()
    await user.keyboard('s')
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
    await user.click(key(6))
    await user.keyboard('{Escape}')
    expect(key(6)).toHaveAttribute('aria-pressed', 'false')
    await user.keyboard('S')
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')
  })

  it('locks out the toggle and the lock while paused', async () => {
    const user = start()
    await user.click(toggle())
    await user.click(key(6))
    act(() => dispatch(pauseGame()))
    expect(toggle()).toBeDisabled()
    expect(key(6)).toHaveAttribute('aria-pressed', 'false')
  })
})
