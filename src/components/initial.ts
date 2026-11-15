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

import { type AppView, CELL_COUNT, type CellView } from './view'

/** A first visit shows the selection screen over an empty board, with every control idle. */
export const INITIAL_VIEW: AppView = {
  mode: 'selecting',
  cells: Array.from({ length: CELL_COUNT }, (): CellView => ({})),
  inputMode: 'normal',
  controls: {
    undo: { disabled: true, title: 'Undo' },
    redo: { disabled: true, title: 'Redo' },
    autoFill: { disabled: true, title: 'Auto-fill pencil marks' },
    erase: { disabled: true, title: 'Erase selected cell' },
    sticky: { disabled: true },
    solve: { disabled: true, title: 'Board is empty.' },
    hint: { disabled: true, title: 'Show the next logical step' },
    clear: { disabled: true, title: 'Clear all numbers from the board.' },
  },
}
