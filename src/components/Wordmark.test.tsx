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

import { Wordmark } from './Wordmark'

describe('Wordmark component', () => {
  it('is announced as one name', () => {
    render(<Wordmark />)
    expect(screen.getByRole('img', { name: 'WASudoku' })).toHaveTextContent('WASudoku')
  })

  it('sets each half in its own voice and theme token', () => {
    render(<Wordmark />)
    const mark = screen.getByRole('img', { name: 'WASudoku' })
    expect(screen.getByText('WA')).toHaveClass('voice-mono', 'text-pencil')
    expect(screen.getByText('Sudoku')).toHaveClass('voice-ink', 'text-ink')
    expect(mark.children).toHaveLength(2)
  })

  it('merges a caller className', () => {
    render(<Wordmark className="text-2xl" />)
    expect(screen.getByRole('img', { name: 'WASudoku' })).toHaveClass('text-2xl', 'inline-flex')
  })
})
