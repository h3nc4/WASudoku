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

import { SIZE } from '../geometry'

const SECONDS_PER_MINUTE = 60
const CLOCK_DIGITS = 2

const twoDigits = (value: number): string => String(value).padStart(CLOCK_DIGITS, '0')

/** A number of seconds as "MM:SS", minutes growing past two digits after 99. */
export const formatTime = (totalSeconds: number): string =>
  `${twoDigits(Math.floor(totalSeconds / SECONDS_PER_MINUTE))}:${twoDigits(totalSeconds % SECONDS_PER_MINUTE)}`

/** A cell index as the board names it, "R1C1" at the top left. */
export const formatCell = (index: number): string =>
  `R${String(Math.floor(index / SIZE) + 1)}C${String((index % SIZE) + 1)}`
