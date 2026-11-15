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

import type { BrowserContext } from 'playwright'

/** What still rests on the generator's randomness, which neither build can seed yet. */
export const NOT_DETERMINISTIC = [
  'first visit with an empty pool, where the solver worker generates the puzzle',
  'pool refill once a pick drops a level below three puzzles',
  'a new game offline with an empty pool',
  'the clue counts and technique levels of generated puzzles per difficulty',
] as const

/** The seed every generating scenario uses once both builds accept one. */
export const GENERATION_SEED = Number(process.env.PARITY_SEED ?? '1')

// Seam for seeded generation from the rust-api-v2 task. Today no build takes a seed, so this
// returns false and scenarios that generate are skipped with a note.
export function seedGeneration(_context: BrowserContext, _seed: number): Promise<boolean> {
  return Promise.resolve(false)
}
