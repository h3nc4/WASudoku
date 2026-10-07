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

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
      const textbox = screen.getByRole('textbox')
      const background = screen.getByTestId('cell-background')

      expect(textbox).toHaveClass('text-error underline decoration-wavy decoration-error')
      expect(textbox).not.toHaveClass('text-pencil')
      expect(background.className).not.toMatch(/bg-/)
    })

    it('applies transient highlight style when isTransientConflict is true', () => {
      render(
        <SudokuCell
          {...defaultProps}
          isTransientConflict
          cell={{ ...defaultProps.cell, value: 3 }}
        />,
      )
      const textbox = screen.getByRole('textbox')
      const background = screen.getByTestId('cell-background')

      expect(textbox).toHaveClass('text-error underline decoration-error')
      expect(textbox).not.toHaveClass('decoration-wavy')
      expect(background.className).not.toMatch(/bg-/)
    })

    it('applies correct classes for given numbers', () => {
      render(<SudokuCell {...defaultProps} isGiven cell={{ ...defaultProps.cell, value: 7 }} />)
      expect(screen.getByRole('textbox')).toHaveClass('text-ink voice-ink')
    })

    it('applies correct classes for user-inputted numbers', () => {
      render(<SudokuCell {...defaultProps} cell={{ ...defaultProps.cell, value: 4 }} />)
      expect(screen.getByRole('textbox')).toHaveClass('text-pencil voice-pencil')
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
      expect(screen.getByRole('textbox')).toHaveClass('text-pencil voice-mono')
    })

    it('applies correct classes for a placed cell (visualization)', () => {
      render(<SudokuCell {...defaultProps} isPlaced cell={{ ...defaultProps.cell, value: 3 }} />)
      const input = screen.getByRole('textbox')
      const background = screen.getByTestId('cell-background')

      expect(input).toHaveClass('text-solver voice-ink')
      expect(background.className).not.toMatch(/bg-/)
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
      expect(screen.getByRole('textbox')).toHaveClass('text-error')
    })

    it('colours user digits as user input when the board is not in solved display', () => {
      render(<SudokuCell {...defaultProps} cell={{ ...defaultProps.cell, value: 4 }} />)
      expect(screen.getByRole('textbox')).toHaveClass('text-pencil')
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
      expect(screen.getByRole('textbox')).toHaveClass('voice-pencil font-semibold!')
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
      expect(screen.getByRole('textbox')).toHaveClass('voice-ink font-extrabold!')
    })

    it('keeps the normal weight on a digit that is not highlighted', () => {
      render(<SudokuCell {...defaultProps} cell={{ ...defaultProps.cell, value: 4 }} />)
      const textbox = screen.getByRole('textbox')
      expect(textbox).not.toHaveClass('font-semibold!')
      expect(textbox).not.toHaveClass('font-extrabold!')
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
