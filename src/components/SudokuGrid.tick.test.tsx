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

import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { generatePuzzleSuccess, setActiveCell, tickTimer } from '@/context/sudoku.actions'
import type { SudokuAction } from '@/context/sudoku.actions.types'
import { useSudokuDispatch } from '@/context/sudoku.hooks'
import { SudokuProvider } from '@/context/SudokuProvider'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

import { SudokuGrid } from './SudokuGrid'

const renders = vi.hoisted(() => ({ cells: 0 }))

// Every cell renders one Input, so counting Inputs counts cell renders.
vi.mock('@/components/ui/input', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/input')>()
  return {
    Input: (props: Parameters<typeof actual.Input>[0]) => {
      renders.cells += 1
      return <actual.Input {...props} />
    },
  }
})
vi.mock('@/hooks/useSudokuPersistence')
vi.mock('@/hooks/useSudokuSolver')
vi.mock('@/hooks/useSudokuFeedback')
vi.mock('@/hooks/useGameTimer')

describe('timer ticks', () => {
  let dispatch: (action: SudokuAction) => void = () => {}

  const Harness = () => {
    const sudokuDispatch = useSudokuDispatch()
    useKeyboardShortcuts()
    useEffect(() => {
      dispatch = sudokuDispatch
    }, [sudokuDispatch])
    return <SudokuGrid />
  }

  beforeEach(() => {
    renders.cells = 0
    globalThis.localStorage.clear()
  })

  it('re-renders no cell and keeps the keydown listener', () => {
    const addListener = vi.spyOn(globalThis, 'addEventListener')
    render(
      <SudokuProvider>
        <Harness />
      </SudokuProvider>,
    )
    act(() => dispatch(generatePuzzleSuccess('1' + '.'.repeat(80), '1'.repeat(81))))
    act(() => dispatch(setActiveCell(40)))
    renders.cells = 0
    addListener.mockClear()

    act(() => dispatch(tickTimer()))
    act(() => dispatch(tickTimer()))

    expect(renders.cells).toBe(0)
    expect(addListener).not.toHaveBeenCalledWith('keydown', expect.anything())
    addListener.mockRestore()
  })
})
