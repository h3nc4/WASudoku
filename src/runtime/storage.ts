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

import {
  readGame,
  readMetrics,
  readPool,
  STORAGE_KEYS,
  type StorageKey,
} from '../core/codec/storage'
import type { LoadedSlices } from '../core/game/events'
import type { KeyValueStore, Logger } from './deps'

/** Reads a key, or null when storage refuses access as a sandboxed or private page may. */
function readKey(storage: KeyValueStore, key: StorageKey, log: Logger): string | null {
  try {
    return storage.getItem(key)
  } catch (error) {
    log.error(`Could not read ${key}:`, error)
    return null
  }
}

/** Every key decoded on its own, for the `loaded` event. A corrupt key is reported, never removed. */
export const loadSlices = (storage: KeyValueStore, log: Logger): LoadedSlices => ({
  game: readGame(readKey(storage, STORAGE_KEYS.GAME, log)),
  metrics: readMetrics(readKey(storage, STORAGE_KEYS.METRICS, log)),
  pool: readPool(readKey(storage, STORAGE_KEYS.POOL, log)),
})

/** Writes a key, logging a full or refused storage rather than failing the update that saved it. */
export function writeKey(storage: KeyValueStore, key: StorageKey, text: string, log: Logger): void {
  try {
    storage.setItem(key, text)
  } catch (error) {
    log.error(`Could not save ${key}:`, error)
  }
}

/** The storage areas of a page and whether it runs inside a frame. */
export interface StoragePage {
  readonly localStorage: KeyValueStore
  readonly sessionStorage: KeyValueStore
  readonly self: unknown
  readonly top: unknown
}

// The page's localStorage, or sessionStorage inside a frame, which keeps the portfolio's preview
// off the visitor's saved game. A store that drops every write stands in on a throw.
export function pageStorage(page: StoragePage): KeyValueStore {
  try {
    return page.self === page.top ? page.localStorage : page.sessionStorage
  } catch {
    return { getItem: () => null, setItem: () => undefined }
  }
}
