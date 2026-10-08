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
import { useTheme } from 'next-themes'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ModeToggle } from './mode-toggle'

// Mock the 'next-themes' hook
vi.mock('next-themes', () => ({
  useTheme: vi.fn(),
}))

describe('ModeToggle component', () => {
  const mockSetTheme = vi.fn()

  const stubReducedMotion = (matches: boolean) => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: matches && query.includes('reduce') })),
    )
  }

  const clickToggle = async (theme: string) => {
    vi.mocked(useTheme).mockReturnValue({
      theme,
      setTheme: mockSetTheme,
      themes: ['light', 'dark'],
    })
    render(<ModeToggle />)
    await userEvent.setup().click(screen.getByRole('button', { name: /toggle theme/i }))
  }

  // A real browser has the API on the prototype, and its transition calls back after the click resolves.
  const nativeViewTransition = Object.getOwnPropertyDescriptor(
    Document.prototype,
    'startViewTransition',
  )

  beforeEach(() => {
    vi.clearAllMocks()
    stubReducedMotion(false)
    Reflect.deleteProperty(Document.prototype, 'startViewTransition')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document, 'startViewTransition')
    if (nativeViewTransition) {
      Object.defineProperty(Document.prototype, 'startViewTransition', nativeViewTransition)
    }
    document.documentElement.className = ''
    document.documentElement.style.colorScheme = ''
  })

  it('toggles from light to dark mode when clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(useTheme).mockReturnValue({
      theme: 'light',
      setTheme: mockSetTheme,
      themes: ['light', 'dark'],
    })

    render(<ModeToggle />)
    const toggleButton = screen.getByRole('button', { name: /toggle theme/i })
    await user.click(toggleButton)

    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })

  it('toggles from dark to light mode when clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(useTheme).mockReturnValue({
      theme: 'dark',
      setTheme: mockSetTheme,
      themes: ['light', 'dark'],
    })

    render(<ModeToggle />)
    const toggleButton = screen.getByRole('button', { name: /toggle theme/i })
    await user.click(toggleButton)

    expect(mockSetTheme).toHaveBeenCalledWith('light')
  })

  describe('with the View Transitions API', () => {
    const startViewTransition = vi.fn((update: () => void) => {
      update()
    })

    beforeEach(() => {
      startViewTransition.mockClear()
      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: startViewTransition,
      })
    })

    it('flips the class inside the transition callback so the snapshots differ', async () => {
      document.documentElement.classList.add('light')
      startViewTransition.mockImplementationOnce((update: () => void) => {
        expect(mockSetTheme).not.toHaveBeenCalled()
        expect(document.documentElement).toHaveClass('light')
        update()
      })

      await clickToggle('light')

      expect(startViewTransition).toHaveBeenCalledOnce()
      expect(mockSetTheme).toHaveBeenCalledWith('dark')
      expect(document.documentElement).toHaveClass('dark')
      expect(document.documentElement).not.toHaveClass('light')
      expect(document.documentElement).toHaveStyle({ colorScheme: 'dark' })
      expect(document.documentElement).not.toHaveClass('theme-switching')
    })

    it('switches at once without a transition under reduced motion', async () => {
      stubReducedMotion(true)

      await clickToggle('dark')

      expect(startViewTransition).not.toHaveBeenCalled()
      expect(mockSetTheme).toHaveBeenCalledWith('light')
    })
  })

  it('switches at once where the View Transitions API is missing', async () => {
    expect('startViewTransition' in document).toBe(false)

    await clickToggle('light')

    expect(mockSetTheme).toHaveBeenCalledWith('dark')
    expect(document.documentElement).not.toHaveClass('dark')
  })
})
