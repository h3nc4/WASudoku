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

import { isBoardString } from '../board'
import { parsePairs, parseQuery, serializeQuery, splitHref } from './query'

/** Query parameter that holds a shared puzzle. */
export const SHARE_PARAM = 'p'

// Each href is an absolute, already normalised address, as location.href always is.

/** Builds a link to the given page with the puzzle, so it works wherever the app is served. */
export const buildShareUrl = (puzzle: string, href: string): string =>
  `${splitHref(href).base}?${serializeQuery([[SHARE_PARAM, puzzle]])}`

/** Reads a valid puzzle from a query string, or null when absent or malformed. */
export function readSharedPuzzle(search: string): string | null {
  const value = parseQuery(search).find(([name]) => name === SHARE_PARAM)?.[1]
  return value !== undefined && isBoardString(value) ? value : null
}

/** Returns the given address without the shared puzzle parameter. */
export function stripSharedPuzzle(href: string): string {
  const { base, query, hash } = splitHref(href)
  const rest = serializeQuery(parsePairs(query ?? '').filter(([name]) => name !== SHARE_PARAM))
  const search = rest === '' ? '' : `?${rest}`
  return `${base}${search}${hash}`
}
