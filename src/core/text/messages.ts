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

import type { MessageId } from '../game/effects'

/** Every toast id the runtime raises: the game's, plus the two its clipboard sink adds. */
export type ToastTextId = MessageId | 'copyFailed' | 'clipboardUnavailable'

/** Toast text by id. A failure reads as one plain sentence, never the solver's own error. */
export const TOASTS: Readonly<Record<ToastTextId, string>> = {
  solved: 'Solver finished. Step through its solution beside the board.',
  solveFailed: 'The solver could not finish this puzzle.',
  generated: 'New puzzle generated!',
  generateFailed: 'Failed to generate a new puzzle.',
  validated: 'Puzzle is valid and has a unique solution.',
  invalidPuzzle: 'Puzzle is invalid or does not have a unique solution.',
  validateFailed: 'The puzzle could not be checked.',
  noHint: 'No hint is available for this board.',
  badPaste: 'Invalid board format in clipboard.',
  imported: 'Board imported from clipboard.',
  exported: 'Board exported to clipboard.',
  linkCopied: 'Puzzle link copied to clipboard.',
  copyFailed: 'Failed to copy to clipboard.',
  clipboardUnavailable: 'Clipboard API not available in this browser or context.',
}

export const toastText = (id: ToastTextId): string => TOASTS[id]

/** Toasts the page raises outside the runtime, with an action or as an update prompt. */
export type NoticeId = 'cleared' | 'autoFilled' | 'updateAvailable'

export const NOTICES: Readonly<Record<NoticeId, string>> = {
  cleared: 'Board cleared.',
  autoFilled: 'Candidates auto-filled.',
  updateAvailable: 'Update available',
}

/** Labels of a toast's buttons. */
export type ToastActionId = 'undo' | 'reload' | 'close'

export const TOAST_ACTIONS: Readonly<Record<ToastActionId, string>> = {
  undo: 'Undo',
  reload: 'Reload',
  close: 'Close notification',
}
