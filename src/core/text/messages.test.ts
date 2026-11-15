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

import { describe, expect, it } from 'vitest'

import { NOTICES, TOAST_ACTIONS, TOASTS, toastText, type ToastTextId } from './messages'

describe('messages', () => {
  it('gives each toast one sentence and no raw error', () => {
    for (const [id, text] of Object.entries(TOASTS)) {
      expect(toastText(id as ToastTextId)).toBe(text)
      expect(text).not.toMatch(/Operation failed|:\s*$/)
    }
    expect(toastText('clipboardUnavailable')).toContain('Clipboard')
    expect(toastText('solved')).toBe('Solver finished. Step through its solution beside the board.')
  })

  it('labels the page notices and the toast buttons', () => {
    expect(NOTICES.cleared).toBe('Board cleared.')
    expect(TOAST_ACTIONS.undo).toBe('Undo')
    expect(TOAST_ACTIONS.reload).toBe('Reload')
  })
})
