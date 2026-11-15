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

import { boardRows, type CellView, type DrawnCell } from '../components/view'

// Assistive technology skips the figure. Its cells drop the focus, the id and the name.
const LIVE_ONLY = new Set(['id', 'tabindex', 'aria-label', 'aria-selected'])

/** The board's cells as the grid draws them, without what only the playable grid needs. */
export const figureRows = (cells: readonly CellView[]): DrawnCell[][] =>
  boardRows(cells).map((row) =>
    row.map((cell) => ({
      ...cell,
      attributes: Object.fromEntries(
        Object.entries(cell.attributes).filter(([name]) => !LIVE_ONLY.has(name)),
      ),
    })),
  )
