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

import { inject } from 'vitest'

declare module 'vitest/browser' {
  interface BrowserCommands {
    /** Axe violations in the calling test's frame, from vitest.config.browser.ts. */
    axe: () => Promise<string[]>
  }
}

const MARK = 'data-built-page'

/** The built page, parsed. */
export const builtPage = (): Document =>
  new DOMParser().parseFromString(inject('builtPage'), 'text/html')

/** Puts the built stylesheet into the test document, once. */
export function applyBuiltStyles(built = builtPage()): void {
  for (const old of document.head.querySelectorAll(`[${MARK}]`)) old.remove()
  for (const style of built.head.querySelectorAll('style')) {
    const copy = document.importNode(style, true)
    copy.setAttribute(MARK, '')
    document.head.append(copy)
  }
}

/** Replaces the test document's body, title and language with the built page's, styles included. */
export function mountBuiltPage(): Document {
  const built = builtPage()
  applyBuiltStyles(built)
  document.documentElement.lang = built.documentElement.lang
  document.title = built.title
  document.body.replaceChildren(
    ...[...built.body.childNodes].map((n) => document.importNode(n, true)),
  )
  return built
}
