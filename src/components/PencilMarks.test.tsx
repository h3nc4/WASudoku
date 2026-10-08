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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { endAnimation } from '@/test/events'

import { LEAVE_FALLBACK_MS, PencilMarks } from './PencilMarks'

describe('PencilMarks component', () => {
  it('renders nothing when both sets are empty', () => {
    const { container } = render(<PencilMarks candidates={new Set()} centers={new Set()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders candidate marks correctly', () => {
    render(<PencilMarks candidates={new Set([1, 5, 9])} centers={new Set()} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })

  it('renders center marks correctly and gives them priority', () => {
    render(<PencilMarks candidates={new Set([1, 2])} centers={new Set([7, 8])} />)
    // Should render center marks
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    // Should NOT render candidate marks
    expect(screen.queryByText('1')).not.toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })

  it('renders small font for many center marks', () => {
    render(<PencilMarks candidates={new Set()} centers={new Set([1, 2, 3, 4, 5])} />)
    const span = screen.getByText('1')
    expect(span).toHaveClass('text-[0.65rem] md:text-xs')
  })

  it('renders normal font for few center marks', () => {
    render(<PencilMarks candidates={new Set()} centers={new Set([1, 2, 3])} />)
    const span = screen.getByText('1')
    expect(span).toHaveClass('text-[0.8rem] md:text-[0.85rem]')
  })

  it('sizes corner marks for legibility on a phone and from md', () => {
    render(<PencilMarks candidates={new Set([1])} centers={new Set()} />)
    expect(screen.getByText('1').parentElement).toHaveClass('text-[0.7rem] md:text-[0.75rem]')
  })

  it('strikes eliminated candidates in the note colour rather than red', () => {
    render(
      <PencilMarks
        candidates={new Set([1, 2, 3])}
        centers={new Set()}
        eliminations={new Set([2])}
      />,
    )
    const eliminatedMark = screen.getByText('2')
    expect(eliminatedMark).toHaveClass('text-note/55 decoration-solver line-through decoration-2')
    expect(eliminatedMark).not.toHaveClass('text-error')

    const normalMark = screen.getByText('1')
    expect(normalMark).not.toHaveClass('line-through')
    expect(normalMark).toHaveClass('text-note')
    expect(normalMark).not.toHaveClass('text-error')
  })

  it('renders with correct base color classes', () => {
    render(<PencilMarks candidates={new Set([1])} centers={new Set()} />)
    expect(screen.getByText('1')).toHaveClass('text-note voice-pencil font-medium')
  })

  describe('motion', () => {
    const none = new Set<number>()

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    })

    it('keeps a candidate a placement removed, struck and hidden from assistive tech', () => {
      const { rerender } = render(<PencilMarks candidates={new Set([2, 5])} centers={none} />)
      rerender(<PencilMarks candidates={new Set([2])} centers={none} motion="strike" />)

      const leaving = screen.getByText('5')
      expect(leaving).toHaveClass('note-struck')
      expect(leaving).toHaveAttribute('aria-hidden', 'true')
      expect(screen.getByText('2')).not.toHaveClass('note-struck')
    })

    it('drops the struck candidate once its animation ends', () => {
      const { rerender } = render(<PencilMarks candidates={new Set([2, 5])} centers={none} />)
      rerender(<PencilMarks candidates={new Set([2])} centers={none} motion="strike" />)

      endAnimation(screen.getByText('5'))
      expect(screen.queryByText('5')).not.toBeInTheDocument()
    })

    it('drops the struck candidate on a timer when no animationend arrives', () => {
      const { rerender } = render(<PencilMarks candidates={new Set([2, 5])} centers={none} />)
      rerender(<PencilMarks candidates={new Set([2])} centers={none} motion="strike" />)

      act(() => {
        vi.advanceTimersByTime(LEAVE_FALLBACK_MS - 1)
      })
      expect(screen.getByText('5')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(screen.queryByText('5')).not.toBeInTheDocument()
    })

    it('keeps the grid on screen while the last candidate leaves', () => {
      const { rerender, container } = render(
        <PencilMarks candidates={new Set([5])} centers={none} />,
      )
      rerender(<PencilMarks candidates={none} centers={none} motion="strike" />)
      expect(screen.getByText('5')).toHaveClass('note-struck')

      act(() => {
        vi.advanceTimersByTime(LEAVE_FALLBACK_MS)
      })
      expect(container).toBeEmptyDOMElement()
    })

    it('fades a note the player toggled off without a strike', () => {
      const { rerender } = render(<PencilMarks candidates={new Set([2, 5])} centers={none} />)
      rerender(<PencilMarks candidates={new Set([2])} centers={none} motion="toggle" />)

      expect(screen.getByText('5')).toHaveClass('note-out')
      expect(screen.getByText('5')).not.toHaveClass('note-struck')
    })

    it('marks notes of a toggled cell to fade in as they first render', () => {
      const { rerender } = render(<PencilMarks candidates={new Set([2])} centers={none} />)
      expect(screen.getByText('2')).not.toHaveClass('note-in')

      rerender(<PencilMarks candidates={new Set([2, 7])} centers={none} motion="toggle" />)
      expect(screen.getByText('7')).toHaveClass('note-in')
    })

    it('snaps a removal that came without motion, such as undo or a new puzzle', () => {
      const { rerender } = render(<PencilMarks candidates={new Set([2, 5])} centers={none} />)
      rerender(<PencilMarks candidates={new Set([2])} centers={none} />)
      expect(screen.queryByText('5')).not.toBeInTheDocument()
    })

    it('shows a leaving candidate as a normal note again when it returns', () => {
      const { rerender } = render(<PencilMarks candidates={new Set([2, 5])} centers={none} />)
      rerender(<PencilMarks candidates={new Set([2])} centers={none} motion="strike" />)
      rerender(<PencilMarks candidates={new Set([2, 5])} centers={none} />)

      expect(screen.getByText('5')).not.toHaveClass('note-struck')
      expect(screen.getByText('5')).not.toHaveAttribute('aria-hidden')
    })

    it('ignores a new set with the same marks', () => {
      const { rerender } = render(<PencilMarks candidates={new Set([2, 5])} centers={none} />)
      rerender(<PencilMarks candidates={new Set([2, 5])} centers={none} motion="strike" />)
      expect(screen.getByText('5')).not.toHaveClass('note-struck')
    })

    it('strikes a center mark a placement removed', () => {
      const { rerender } = render(<PencilMarks candidates={none} centers={new Set([3, 8])} />)
      rerender(<PencilMarks candidates={none} centers={new Set([3])} motion="strike" />)

      expect(screen.getByText('8')).toHaveClass('note-struck')
      act(() => {
        vi.advanceTimersByTime(LEAVE_FALLBACK_MS)
      })
      expect(screen.queryByText('8')).not.toBeInTheDocument()
    })

    it('drops each struck center mark as its own animation ends', () => {
      const { rerender } = render(<PencilMarks candidates={none} centers={new Set([3, 7, 8])} />)
      rerender(<PencilMarks candidates={none} centers={new Set([3])} motion="strike" />)

      endAnimation(screen.getByText('8'))
      expect(screen.queryByText('8')).not.toBeInTheDocument()
      expect(screen.getByText('7')).toHaveClass('note-struck')
    })

    it('ignores a repeated animationend for a mark already dropped', () => {
      const { rerender } = render(<PencilMarks candidates={new Set([2, 5, 6])} centers={none} />)
      rerender(<PencilMarks candidates={new Set([2])} centers={none} motion="strike" />)

      const leaving = screen.getByText('5')
      act(() => {
        endAnimation(leaving)
        endAnimation(leaving)
      })
      expect(screen.queryByText('5')).not.toBeInTheDocument()
      expect(screen.getByText('6')).toHaveClass('note-struck')
    })

    it('lets a removed mark go at once under reduced motion', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({ matches: query.includes('reduce') })),
      )
      const { rerender } = render(<PencilMarks candidates={new Set([2, 5])} centers={none} />)
      rerender(<PencilMarks candidates={new Set([2])} centers={none} motion="strike" />)
      expect(screen.queryByText('5')).not.toBeInTheDocument()
    })
  })
})
