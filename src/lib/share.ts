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

import { isBoardStringValid } from './utils'

/** Query parameter that holds a shared puzzle. */
export const SHARE_PARAM = 'p'

/** Builds a link to the given page with the puzzle, so it works wherever the app is served. */
export function buildShareUrl(boardString: string, href: string): string {
  const url = new URL(href)
  url.search = ''
  url.hash = ''
  url.searchParams.set(SHARE_PARAM, boardString)
  return url.toString()
}

/** Reads a valid puzzle from a query string, or null when absent or malformed. */
export function readSharedPuzzle(search: string): string | null {
  const value = new URLSearchParams(search).get(SHARE_PARAM)
  return value !== null && isBoardStringValid(value) ? value : null
}

/** Returns the given address without the shared puzzle parameter. */
export function stripSharedPuzzle(href: string): string {
  const url = new URL(href)
  url.searchParams.delete(SHARE_PARAM)
  return url.toString()
}
