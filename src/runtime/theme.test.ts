/*
 * Copyright (C) 2026  Henrique Almeida
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

import { describe, expect, it, vi } from 'vitest'

import { MemoryStorage } from '../test/runtime-fakes'
import { DEFAULT_THEME, otherTheme, readTheme, storeTheme, THEME_KEY } from './theme'

const dark = () => true
const light = () => false

describe('readTheme', () => {
  it('reads the key the previous build wrote', () => {
    expect(readTheme(new MemoryStorage({ [THEME_KEY]: 'light' }), dark)).toBe('light')
    expect(readTheme(new MemoryStorage({ [THEME_KEY]: 'dark' }), light)).toBe('dark')
  })

  it('defaults to dark, as the previous build did, for a missing or unknown value', () => {
    expect(DEFAULT_THEME).toBe('dark')
    expect(readTheme(new MemoryStorage(), light)).toBe('dark')
    expect(readTheme(new MemoryStorage({ [THEME_KEY]: '"light"' }), light)).toBe('dark')
  })

  it('resolves system to the preference', () => {
    expect(readTheme(new MemoryStorage({ [THEME_KEY]: 'system' }), dark)).toBe('dark')
    expect(readTheme(new MemoryStorage({ [THEME_KEY]: 'system' }), light)).toBe('light')
  })

  it('falls back to the default when storage refuses access', () => {
    const storage = new MemoryStorage()
    storage.getItem = () => {
      throw new DOMException('denied', 'SecurityError')
    }
    expect(readTheme(storage, light)).toBe(DEFAULT_THEME)
  })
})

describe('storeTheme', () => {
  it('writes the bare name under the shared key', () => {
    const storage = new MemoryStorage()
    storeTheme(storage, 'light', { error: vi.fn() })
    expect(storage.writes).toEqual([[THEME_KEY, 'light']])
  })

  it('logs a refused write', () => {
    const storage = new MemoryStorage()
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
    const log = { error: vi.fn() }
    storeTheme(storage, 'dark', log)
    expect(log.error).toHaveBeenCalledWith('Could not save the theme:', expect.any(DOMException))
  })
})

it('flips between the two themes', () => {
  expect(otherTheme('dark')).toBe('light')
  expect(otherTheme('light')).toBe('dark')
})
