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

import type { MessageId, Tone } from '../core/game/effects'
import type { SolverClient } from '../solver/client'

/** The part of `localStorage` the runtime uses, so a test can hand it a map. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Cancels a scheduled callback. Calling it after the callback ran does nothing. */
export type Cancel = () => void

export interface Timers {
  timeout(callback: () => void, delayMs: number): Cancel
  /** Runs the callback once the page is idle, or after a short delay where idle callbacks are missing. */
  idle(callback: () => void): Cancel
}

export interface ClipboardPort {
  writeText(text: string): Promise<void>
}

/** Messages only the runtime raises, which the core has no id for. */
export type RuntimeMessageId = 'copyFailed' | 'clipboardUnavailable'

export type ToastId = MessageId | RuntimeMessageId

/** Shows a toast. The UI maps each id to text in the player's locale. */
export type ToastSink = (message: ToastId, tone: Tone) => void

export interface Logger {
  readonly error: (...data: unknown[]) => void
}

/** The part of `history` that replaces the address. */
export interface AddressBar {
  readonly state: unknown
  readonly replaceState: (data: unknown, unused: string, url: string) => void
}

/** Every side effect the store performs goes through one of these, so tests hand it fakes. */
export interface RuntimeDeps {
  readonly storage: KeyValueStore
  readonly timers: Timers
  readonly solver: SolverClient
  /** Missing outside a secure context. */
  readonly clipboard: ClipboardPort | undefined
  readonly location: { readonly search: string; readonly href: string }
  readonly history: AddressBar
  /** Milliseconds on a clock that never runs backwards within a session. */
  readonly now: () => number
  readonly toast: ToastSink
  readonly log: Logger
  /** A generator seed, a non-negative safe integer. */
  readonly seed: () => number
}
