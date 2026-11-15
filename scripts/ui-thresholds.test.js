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

// @vitest-environment node
import { describe, expect, it } from 'vitest'

import config from '../vite.config.ts'

const FULL = { lines: 100, branches: 100, functions: 100, statements: 100 }

describe('test:ui coverage', () => {
  it('fails below full coverage of every metric', () => {
    expect(config.test.coverage.thresholds).toEqual(FULL)
  })
})
