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

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SudokuCell from './SudokuCell'

describe('SudokuCell component', () => {
  const mockOnFocus = vi.fn()
  const defaultProps = {
    cell: {
      value: null,
      isGiven: false,
      candidates: new Set<number>(),
      centers: new Set<number>(),
    },
    index: 10,
    isGiven: false,
    isInitial: false,
    isSolving: false,
    isSolved: false,
    isConflict: false,
    isActive: false,
    isHighlighted: false,
    isNumberHighlighted: false,
    isCause: false,
    isPlaced: false,
    onFocus: mockOnFocus,
    isTransientConflict: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('Pointer taps', () => {
    it('reports a click as a tap, apart from focus', () => {
      const onTap = vi.fn()
      render(<SudokuCell {...defaultProps} onTap={onTap} />)
      const input = screen.getByRole('textbox')
      fireEvent.focus(input)
      expect(onTap).not.toHaveBeenCalled()
      fireEvent.click(input)
      expect(onTap).toHaveBeenCalledWith(10)
    })

    it('ignores a click without a tap handler', () => {
      render(<SudokuCell {...defaultProps} />)
      fireEvent.click(screen.getByRole('textbox'))
      expect(mockOnFocus).not.toHaveBeenCalled()
    })
  })

  describe('Rendering and Visual States', () => {
    it('renders a readonly input with correct aria-label and type="tel"', () => {
      render(<SudokuCell {...defaultProps} />)
      const input = screen.getByLabelText(/Sudoku cell at row 2, column 2/)
      expect(input).toBeInTheDocument()
      expect(input).toHaveValue('')
      expect(input).toHaveAttribute('type', 'tel')
      expect(input).toHaveAttribute('readonly')
    })

    it('renders a cell with a definitive value', () => {
      render(<SudokuCell {...defaultProps} cell={{ ...defaultProps.cell, value: 5 }} />)
      expect(screen.getByRole('textbox')).toHaveValue('5')
    })

    it('draws the digit beside the input and keeps the input text transparent', () => {
      render(<SudokuCell {...defaultProps} cell={{ ...defaultProps.cell, value: 5 }} />)
      const digit = screen.getByTestId('cell-digit')
      expect(digit).toHaveTextContent('5')
      expect(digit).toHaveAttribute('aria-hidden', 'true')
      expect(screen.getByRole('textbox')).toHaveClass('text-transparent')
    })

    it('draws no digit in an empty cell', () => {
      render(<SudokuCell {...defaultProps} />)
      expect(screen.queryByTestId('cell-digit')).not.toBeInTheDocument()
    })

    it('renders pencil marks when value is null', () => {
      render(
        <SudokuCell
          {...defaultProps}
          cell={{ ...defaultProps.cell, candidates: new Set([1, 9]) }}
        />,
      )
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('9')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toHaveClass('text-transparent')
    })

    it('renders eliminated pencil marks with line-through style', () => {
      render(
        <SudokuCell
          {...defaultProps}
          cell={{ ...defaultProps.cell, candidates: new Set([1, 9]) }}
          eliminatedCandidates={new Set([9])}
        />,
      )
      expect(screen.getByText('1')).not.toHaveClass('line-through')
      expect(screen.getByText('9')).toHaveClass('line-through')
    })

    it('is marked as invalid when in conflict', () => {
      render(<SudokuCell {...defaultProps} isConflict />)
      expect(screen.getByRole('textbox')).toBeInvalid()
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    })

    it('is marked as invalid when isError is true', () => {
      render(<SudokuCell {...defaultProps} isError />)
      expect(screen.getByRole('textbox')).toBeInvalid()
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    })

    it('marks a wrong digit with error text and a wavy underline, not a cell fill', () => {
      render(<SudokuCell {...defaultProps} isError cell={{ ...defaultProps.cell, value: 5 }} />)
      const digit = screen.getByTestId('cell-digit')
      const background = screen.getByTestId('cell-background')

      expect(digit).toHaveClass('text-error underline decoration-wavy decoration-error')
      expect(digit).not.toHaveClass('text-pencil')
      expect(background.className).not.toMatch(/bg-/)
    })

    it('turns a wrong digit red at once and draws its underline in', () => {
      render(<SudokuCell {...defaultProps} isError cell={{ ...defaultProps.cell, value: 5 }} />)
      expect(screen.getByTestId('cell-digit')).toHaveClass('cell-ink ink-alarm underline-in')
    })

    it('lets a digit leave the error state through the ordinary fade', () => {
      const props = { ...defaultProps, cell: { ...defaultProps.cell, value: 5 } }
      const { rerender } = render(<SudokuCell {...props} isConflict />)
      rerender(<SudokuCell {...props} />)

      const digit = screen.getByTestId('cell-digit')
      expect(digit).toHaveClass('cell-ink text-pencil')
      expect(digit).not.toHaveClass('ink-alarm')
      expect(digit).not.toHaveClass('underline-in')
    })

    it('pulses a transiently clashing digit instead of underlining it', () => {
      render(
        <SudokuCell
          {...defaultProps}
          isTransientConflict
          cell={{ ...defaultProps.cell, value: 3 }}
        />,
      )
      const digit = screen.getByTestId('cell-digit')
      const background = screen.getByTestId('cell-background')

      expect(digit).toHaveClass('text-error ink-alarm conflict-pulse')
      expect(digit).not.toHaveClass('underline')
      expect(digit).not.toHaveClass('conflict-mark')
      expect(background.className).not.toMatch(/bg-/)
    })

    it('outlines a transiently clashing digit without motion under reduced motion', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({ matches: query.includes('reduce') })),
      )
      render(
        <SudokuCell
          {...defaultProps}
          isTransientConflict
          cell={{ ...defaultProps.cell, value: 3 }}
        />,
      )
      const digit = screen.getByTestId('cell-digit')

      expect(digit).toHaveClass('text-error conflict-mark')
      expect(digit).not.toHaveClass('conflict-pulse')
    })

    it('applies correct classes for given numbers', () => {
      render(<SudokuCell {...defaultProps} isGiven cell={{ ...defaultProps.cell, value: 7 }} />)
      expect(screen.getByTestId('cell-digit')).toHaveClass('text-ink voice-ink')
    })

    it('applies correct classes for user-inputted numbers', () => {
      render(<SudokuCell {...defaultProps} cell={{ ...defaultProps.cell, value: 4 }} />)
      expect(screen.getByTestId('cell-digit')).toHaveClass('text-pencil voice-pencil')
    })

    it('applies correct classes for solver-added numbers', () => {
      render(
        <SudokuCell
          {...defaultProps}
          isSolved
          isGiven={false}
          cell={{ ...defaultProps.cell, value: 7 }}
        />,
      )
      expect(screen.getByTestId('cell-digit')).toHaveClass('text-pencil voice-mono')
    })

    it('applies correct classes for a placed cell (visualization)', () => {
      render(<SudokuCell {...defaultProps} isPlaced cell={{ ...defaultProps.cell, value: 3 }} />)
      const digit = screen.getByTestId('cell-digit')
      const background = screen.getByTestId('cell-background')

      expect(digit).toHaveClass('text-solver voice-ink')
      expect(background).toHaveClass('bg-solver-wash')
    })

    it('applies correct background for an active cell', () => {
      render(<SudokuCell {...defaultProps} isActive />)
      expect(screen.getByTestId('cell-background')).toHaveClass('highlighter')
    })

    it('applies correct background for a highlighted (but not active) cell', () => {
      render(<SudokuCell {...defaultProps} isHighlighted isActive={false} />)
      expect(screen.getByTestId('cell-background')).toHaveClass('bg-peer')
    })

    it('applies correct background for a number-highlighted cell', () => {
      render(
        <SudokuCell
          {...defaultProps}
          isNumberHighlighted
          cell={{ ...defaultProps.cell, value: 5 }}
        />,
      )
      expect(screen.getByTestId('cell-background')).toHaveClass('bg-same')
    })

    it('applies correct background when solving', () => {
      render(<SudokuCell {...defaultProps} isSolving />)
      expect(screen.getByTestId('cell-background')).toHaveClass('cursor-not-allowed')
    })

    it('rings a cause cell in visualization and keeps its peer shading', () => {
      render(<SudokuCell {...defaultProps} isCause isHighlighted />)
      expect(screen.getByTestId('cell-background')).toHaveClass(
        'ring-[1.5px] ring-inset ring-solver bg-peer',
      )
    })

    it('marks a hint target with the solver hatch and ring, above the active highlight', () => {
      render(<SudokuCell {...defaultProps} isHintTarget isActive />)
      const background = screen.getByTestId('cell-background')
      expect(background).toHaveClass('solver-hatch ring-2 ring-inset ring-solver')
      expect(background).not.toHaveClass('highlighter')
    })

    it('keeps the error text on a hint target and adds the ring', () => {
      render(
        <SudokuCell
          {...defaultProps}
          isHintTarget
          isError
          cell={{ ...defaultProps.cell, value: 5 }}
        />,
      )
      expect(screen.getByTestId('cell-background')).toHaveClass('solver-hatch ring-2')
      expect(screen.getByTestId('cell-digit')).toHaveClass('text-error')
    })

    it('colours user digits as user input when the board is not in solved display', () => {
      render(<SudokuCell {...defaultProps} cell={{ ...defaultProps.cell, value: 4 }} />)
      expect(screen.getByTestId('cell-digit')).toHaveClass('text-pencil')
    })

    it('draws no moment layer on an ordinary cell', () => {
      render(<SudokuCell {...defaultProps} isActive />)
      expect(screen.queryByTestId('cell-moment')).not.toBeInTheDocument()
    })

    it('draws a moment on its own layer with its start delay, leaving the fill classes alone', () => {
      render(
        <SudokuCell {...defaultProps} isActive moment="sweep" momentDelay={75} momentKey={3} />,
      )
      const layer = screen.getByTestId('cell-moment')
      expect(layer).toHaveAttribute('data-moment', 'sweep')
      expect(layer).toHaveClass('board-moment')
      expect(layer.style.getPropertyValue('--moment-delay')).toBe('75ms')
      expect(screen.getByTestId('cell-background')).toHaveClass('cell-fill highlighter cell-on')
    })

    it('remounts the moment layer for each new moment so its animation replays', () => {
      const { rerender } = render(<SudokuCell {...defaultProps} moment="revert" momentKey={1} />)
      const first = screen.getByTestId('cell-moment')
      rerender(<SudokuCell {...defaultProps} moment="revert" momentKey={1} />)
      expect(screen.getByTestId('cell-moment')).toBe(first)
      rerender(<SudokuCell {...defaultProps} moment="revert" momentKey={2} />)
      expect(screen.getByTestId('cell-moment')).not.toBe(first)
    })

    it('applies correct border for right edge of a box', () => {
      const { container } = render(<SudokuCell {...defaultProps} index={2} />) // col 2
      expect(container.firstChild).toHaveClass('border-r-2 border-r-grid-thick')
      expect(container.firstChild).toHaveClass('border-b border-b-grid-thin')
    })

    it('applies correct border for bottom edge of a box', () => {
      const { container } = render(<SudokuCell {...defaultProps} index={18} />) // row 2
      expect(container.firstChild).toHaveClass('border-b-2 border-b-grid-thick')
    })

    it('leaves the outer edge to the board frame', () => {
      const { container } = render(<SudokuCell {...defaultProps} index={80} />)
      expect(container.firstChild).not.toHaveClass(
        'border-r',
        'border-b',
        'border-r-2',
        'border-b-2',
      )
    })

    it('shows an ink ring on keyboard focus', () => {
      render(<SudokuCell {...defaultProps} />)
      expect(screen.getByRole('textbox')).toHaveClass('focus-visible:ring-2 focus-visible:ring-ink')
    })

    it('rings the active cell in ink without keyboard focus and keeps the highlighter', () => {
      render(<SudokuCell {...defaultProps} isActive />)
      expect(screen.getByRole('textbox')).toHaveClass('ring-2 ring-inset ring-ink')
      expect(screen.getByTestId('cell-background')).toHaveClass('highlighter')
    })

    it('rings an active hint target in amber so the hint ring is not hidden', () => {
      render(<SudokuCell {...defaultProps} isActive isHintTarget />)
      expect(screen.getByRole('textbox')).toHaveClass('ring-2 ring-inset ring-solver')
      expect(screen.getByRole('textbox')).not.toHaveClass('ring-ink')
      expect(screen.getByRole('textbox')).toHaveClass('focus-visible:ring-solver')
    })

    it('leaves an inactive cell without the ink ring', () => {
      render(<SudokuCell {...defaultProps} />)
      expect(screen.getByRole('textbox')).not.toHaveClass('ring-2')
    })

    it('sets a same-number pencil digit one weight heavier', () => {
      render(
        <SudokuCell
          {...defaultProps}
          cell={{ ...defaultProps.cell, value: 4 }}
          isNumberHighlighted
        />,
      )
      expect(screen.getByTestId('cell-digit')).toHaveClass('voice-pencil font-bold')
    })

    it('sets a same-number given one weight heavier', () => {
      render(
        <SudokuCell
          {...defaultProps}
          cell={{ ...defaultProps.cell, value: 4, isGiven: true }}
          isGiven
          isNumberHighlighted
        />,
      )
      expect(screen.getByTestId('cell-digit')).toHaveClass('voice-ink font-extrabold')
    })

    it('keeps the normal weight on a digit that is not highlighted', () => {
      render(<SudokuCell {...defaultProps} cell={{ ...defaultProps.cell, value: 4 }} />)
      const digit = screen.getByTestId('cell-digit')
      expect(digit).not.toHaveClass('font-bold')
      expect(digit).not.toHaveClass('font-extrabold')
    })
  })

  describe('Motion', () => {
    it('gives every cell the fading fill layers, with the long fade when nothing is shaded', () => {
      render(<SudokuCell {...defaultProps} />)
      const background = screen.getByTestId('cell-background')
      expect(background).toHaveClass('cell-fill')
      expect(background).not.toHaveClass('cell-on')
      expect(screen.getByRole('textbox')).toHaveClass('cell-ink')
      expect(screen.getByRole('textbox')).not.toHaveClass('cell-on')
    })

    it.each([
      ['active', { isActive: true }, 'highlighter'],
      ['peer', { isHighlighted: true }, 'bg-peer'],
      ['same-number', { isNumberHighlighted: true }, 'bg-same'],
      ['placed', { isPlaced: true }, 'bg-solver-wash'],
      ['hint target', { isHintTarget: true }, 'solver-hatch'],
      ['cause', { isCause: true }, 'ring-solver'],
    ])('switches a %s cell to the short arriving fade', (_, state, shading) => {
      render(<SudokuCell {...defaultProps} {...state} />)
      expect(screen.getByTestId('cell-background')).toHaveClass('cell-fill cell-on', shading)
    })

    it('fades the selection ring in fast on the active cell', () => {
      render(<SudokuCell {...defaultProps} isActive />)
      expect(screen.getByRole('textbox')).toHaveClass('cell-ink cell-on ring-2')
    })

    it('leaves font weight out of the transitions', () => {
      render(
        <SudokuCell
          {...defaultProps}
          isActive
          isNumberHighlighted
          cell={{ ...defaultProps.cell, value: 4 }}
        />,
      )
      expect(screen.getByRole('textbox').className).not.toMatch(/transition|duration-/)
      expect(screen.getByTestId('cell-digit').className).not.toMatch(/transition|duration-/)
    })

    it('inks in a digit the player just entered', () => {
      render(
        <SudokuCell {...defaultProps} animateEntry cell={{ ...defaultProps.cell, value: 4 }} />,
      )
      expect(screen.getByTestId('cell-digit')).toHaveClass('ink-in')
    })

    it('shows a digit that arrived any other way at once', () => {
      render(<SudokuCell {...defaultProps} cell={{ ...defaultProps.cell, value: 4 }} />)
      expect(screen.getByTestId('cell-digit')).not.toHaveClass('ink-in')
    })

    it('mounts a fresh digit for each new value so the ink-in replays', () => {
      const cell = { ...defaultProps.cell, value: 4 }
      const { rerender } = render(<SudokuCell {...defaultProps} animateEntry cell={cell} />)
      const first = screen.getByTestId('cell-digit')

      rerender(<SudokuCell {...defaultProps} animateEntry cell={{ ...cell, value: 7 }} />)
      expect(screen.getByTestId('cell-digit')).not.toBe(first)
    })

    it('replays the ink-in when the same digit is typed again after an erase', () => {
      const cell = { ...defaultProps.cell, value: 4 }
      const { rerender } = render(<SudokuCell {...defaultProps} animateEntry cell={cell} />)
      const first = screen.getByTestId('cell-digit')

      rerender(<SudokuCell {...defaultProps} cell={{ ...cell, value: null }} />)
      expect(screen.queryByTestId('cell-digit')).not.toBeInTheDocument()

      rerender(<SudokuCell {...defaultProps} animateEntry cell={cell} />)
      const second = screen.getByTestId('cell-digit')
      expect(second).not.toBe(first)
      expect(second).toHaveClass('ink-in')
    })

    it('keeps the same digit element when only the shading changes', () => {
      const cell = { ...defaultProps.cell, value: 4 }
      const { rerender } = render(<SudokuCell {...defaultProps} cell={cell} />)
      const first = screen.getByTestId('cell-digit')

      rerender(<SudokuCell {...defaultProps} isHighlighted cell={cell} />)
      expect(screen.getByTestId('cell-digit')).toBe(first)
    })
  })

  describe('User Interaction', () => {
    it('calls onFocus when the input is focused (e.g., by clicking)', async () => {
      const user = userEvent.setup()
      render(<SudokuCell {...defaultProps} />)
      await user.click(screen.getByRole('textbox'))
      expect(mockOnFocus).toHaveBeenCalledWith(10)
    })
  })
})
