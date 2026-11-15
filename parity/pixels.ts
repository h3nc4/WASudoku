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

import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

import { writeOut } from './report.ts'

/** Per-pixel colour distance pixelmatch treats as equal, its own default. */
const COLOUR_THRESHOLD = 0.1
const PERCENT = 100

/** Percent of pixels that differ, with the two frames and the diff written out when any do. */
export function diffPercent(ref: Buffer, candidate: Buffer, label: string): number {
  const [a, b] = [PNG.sync.read(ref), PNG.sync.read(candidate)]
  if (a.width !== b.width || a.height !== b.height) {
    writeOut(`${label}-ref.png`, ref)
    writeOut(`${label}-candidate.png`, candidate)
    return PERCENT
  }
  const out = new PNG({ width: a.width, height: a.height })
  const changed = pixelmatch(a.data, b.data, out.data, a.width, a.height, {
    threshold: COLOUR_THRESHOLD,
  })
  const percent = (PERCENT * changed) / (a.width * a.height)
  if (changed > 0) {
    writeOut(`${label}-diff.png`, PNG.sync.write(out))
    writeOut(`${label}-ref.png`, ref)
    writeOut(`${label}-candidate.png`, candidate)
  }
  return percent
}
