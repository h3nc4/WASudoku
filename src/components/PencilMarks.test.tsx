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
import { describe, expect, it } from 'vitest'

import { PencilMarks } from './PencilMarks'

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
    expect(eliminatedMark).toHaveClass('text-note line-through decoration-2')
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
})
