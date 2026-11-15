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

import type { KeyValueStore, Logger } from './deps'

export type Theme = 'light' | 'dark'

/** The key and default of the build this replaces. A returning player keeps their choice. */
export const THEME_KEY = 'wasudoku-ui-theme'
export const DEFAULT_THEME: Theme = 'dark'
/** The previous build could also store this, which follows the system preference. */
const SYSTEM = 'system'

const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark'

/** The stored theme, `system` resolved by `prefersDark`, or the default for anything else. */
export function readTheme(storage: KeyValueStore, prefersDark: () => boolean): Theme {
  let stored: string | null
  try {
    stored = storage.getItem(THEME_KEY)
  } catch {
    return DEFAULT_THEME
  }
  if (stored === SYSTEM) return prefersDark() ? 'dark' : 'light'
  return isTheme(stored) ? stored : DEFAULT_THEME
}

export function storeTheme(storage: KeyValueStore, theme: Theme, log: Logger): void {
  try {
    storage.setItem(THEME_KEY, theme)
  } catch (error) {
    log.error('Could not save the theme:', error)
  }
}

export const otherTheme = (theme: Theme): Theme => (theme === 'dark' ? 'light' : 'dark')
