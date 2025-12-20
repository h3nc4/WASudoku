/*
 * Copyright (C) 2025  Henrique Almeida
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

import { useSynchronizedHeight } from './useSynchronizedHeight'

let mockResizeObserverCallback: ResizeObserverCallback | null = null
const mockDisconnect = vi.fn()
const mockObserve = vi.fn()

const ResizeObserverMock = vi.fn(function (callback: ResizeObserverCallback) {
  mockResizeObserverCallback = callback
  return {
    observe: mockObserve,
    unobserve: vi.fn(),
    disconnect: mockDisconnect,
  }
})

describe('useSynchronizedHeight', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    mockResizeObserverCallback = null
    mockDisconnect.mockClear()
    mockObserve.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const TestComponent = ({ isEnabled }: { isEnabled: boolean }) => {
    const { sourceRef, targetRef } = useSynchronizedHeight(isEnabled)
    return (
      <>
        <div ref={sourceRef} data-testid="source" />
        <div ref={targetRef} data-testid="target" />
      </>
    )
  }

  it('should not apply height or observe if isEnabled is false', () => {
    render(<TestComponent isEnabled={false} />)
    const target = screen.getByTestId('target')

    // eslint-disable-next-line jest-dom/prefer-to-have-style
    expect(target.style.height).toBe('')
    expect(mockObserve).not.toHaveBeenCalled()
  })

  it('should synchronize height when isEnabled is true', () => {
    const { rerender } = render(<TestComponent isEnabled={false} />)
    const source = screen.getByTestId('source')
    const target = screen.getByTestId('target')

    Object.defineProperty(source, 'offsetHeight', {
      configurable: true,
      value: 500,
    })

    rerender(<TestComponent isEnabled={true} />)

    expect(target).toHaveStyle({ height: '500px' })
    expect(mockObserve).toHaveBeenCalledWith(source)
  })

  it('should update height when ResizeObserver is triggered', () => {
    const { rerender } = render(<TestComponent isEnabled={false} />)
    const source = screen.getByTestId('source')
    const target = screen.getByTestId('target')

    Object.defineProperty(source, 'offsetHeight', {
      configurable: true,
      value: 500,
    })
    rerender(<TestComponent isEnabled={true} />)
    expect(target).toHaveStyle({ height: '500px' })

    Object.defineProperty(source, 'offsetHeight', {
      configurable: true,
      value: 600,
    })

    act(() => {
      mockResizeObserverCallback?.([], {} as ResizeObserver)
    })

    expect(target).toHaveStyle({ height: '600px' })
  })

  it('should disconnect the observer on unmount', () => {
    const { unmount } = render(<TestComponent isEnabled={true} />)
    expect(mockObserve).toHaveBeenCalledOnce()

    unmount()
    expect(mockDisconnect).toHaveBeenCalledOnce()
  })

  it('should reset the height when the hook is disabled', () => {
    const { rerender } = render(<TestComponent isEnabled={false} />)
    const source = screen.getByTestId('source')
    const target = screen.getByTestId('target')

    Object.defineProperty(source, 'offsetHeight', {
      configurable: true,
      value: 500,
    })
    rerender(<TestComponent isEnabled={true} />)
    expect(target).toHaveStyle({ height: '500px' })

    rerender(<TestComponent isEnabled={false} />)

    // eslint-disable-next-line jest-dom/prefer-to-have-style
    expect(target.style.height).toBe('')
    expect(mockDisconnect).toHaveBeenCalledOnce()
  })
})
