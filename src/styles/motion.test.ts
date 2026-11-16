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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve('src/styles/app.css'), 'utf8')

/** The unlayered reduced-motion rule, which starts at a line of its own and overrides every layer. */
const reducedMotion = (): string => {
  const start = css.indexOf('\n@media (prefers-reduced-motion: reduce) {')
  expect(start).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('\n}', start))
}

describe('reduced motion', () => {
  // A label inheriting its button's colour showed the old colour on the new background until a frame ran.
  it('starts no transition, so a state change is drawn whole at once', () => {
    expect(reducedMotion()).toMatch(/transition-duration: 0s;/)
  })
})
