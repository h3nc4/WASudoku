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

import { NOTICES, TOAST_ACTIONS, TOASTS } from '../core/text/messages'
import type { UpdateOffer } from '../runtime/app-update'
import type { ToastId, ToastSink } from '../runtime/deps'
import type { Toaster } from './toast'

// A toast id the runtime adds without text here fails to compile.
const TEXT = TOASTS satisfies Readonly<Record<ToastId, string>>

/** The runtime's toasts by id. A repeat of one on screen replaces it. */
export const toastSink =
  (toaster: Toaster): ToastSink =>
  (message, tone) => {
    toaster.show(TEXT[message], { id: message, tone })
  }

export type Notice = 'cleared' | 'autoFilled'

/** The page's own notices. Clearing the board offers its undo. */
export const notifier =
  (toaster: Toaster, undo: () => void) =>
  (notice: Notice): void => {
    toaster.show(NOTICES[notice], {
      id: notice,
      tone: 'info',
      ...(notice === 'cleared' ? { action: { label: TOAST_ACTIONS.undo, run: undo } } : {}),
    })
  }

/** A waiting build offers itself until the player reloads into it or closes the toast. */
export const updateOffer =
  (toaster: Toaster): UpdateOffer =>
  (apply) => {
    toaster.show(NOTICES.updateAvailable, {
      id: 'updateAvailable',
      duration: Infinity,
      action: { label: TOAST_ACTIONS.reload, run: apply },
    })
  }
