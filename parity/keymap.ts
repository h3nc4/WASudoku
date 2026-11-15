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

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The keys under test and where they were read from. */
export interface KeySource {
  readonly from: string
  readonly keys: readonly string[]
}

/** The core keymap the rewrite adds. Once it exists it is the source of truth. */
const CORE_KEYMAP = 'src/core/keymap.ts'
/** Files of the React app that hold the bindings, the hook for page keys and the grid for cell keys. */
const HANDLERS = ['src/hooks/useKeyboardShortcuts.ts', 'src/components/SudokuGrid.tsx']
const KEYMAP_EXPORTS = ['KEYS', 'KEYMAP', 'BINDINGS']

const keyOf = (entry: unknown): string[] => {
  if (typeof entry === 'string') return [entry]
  const key: unknown = typeof entry === 'object' && entry ? Reflect.get(entry, 'key') : null
  return typeof key === 'string' ? [key] : []
}

/** Reads `KEYS`, `KEYMAP` or `BINDINGS` from the core keymap, as key strings, entries or a record. */
async function fromCore(file: string): Promise<string[] | null> {
  const module: unknown = await import(pathToFileURL(file).href)
  for (const name of KEYMAP_EXPORTS) {
    const value: unknown = typeof module === 'object' && module ? Reflect.get(module, name) : null
    if (Array.isArray(value)) return value.flatMap(keyOf)
    if (typeof value === 'object' && value) return Object.keys(value)
  }
  return null
}

/** Every key literal the handlers compare against, ranges such as '0' to '9' expanded. */
export function scanHandlers(sources: readonly string[]): string[] {
  const keys = new Set<string>()
  for (const source of sources) {
    for (const [, key = ''] of source.matchAll(/\bkey(?:\.toLowerCase\(\))?\s*===\s*'([^']+)'/g)) {
      keys.add(key)
    }
    for (const [, from = '', to = ''] of source.matchAll(
      /\bkey\s*>=\s*'(.)'\s*&&\s*key\s*<=\s*'(.)'/g,
    )) {
      for (let code = from.charCodeAt(0); code <= to.charCodeAt(0); code++) {
        keys.add(String.fromCharCode(code))
      }
    }
    for (const [, list = ''] of source.matchAll(/\[([^\]]*)\]\.includes\(key\)/g)) {
      for (const [, key = ''] of list.matchAll(/'([^']+)'/g)) keys.add(key)
    }
  }
  // A handler that lowercases the key binds both cases of a letter.
  for (const key of [...keys])
    if (/^[a-z]$/i.test(key)) keys.add(key.toUpperCase()).add(key.toLowerCase())
  return [...keys].sort((a, b) => a.localeCompare(b))
}

/** The core keymap when it exists and loads, otherwise the keys the React handlers compare. */
export async function loadKeys(root: string): Promise<KeySource> {
  const core = join(root, CORE_KEYMAP)
  if (existsSync(core)) {
    const keys = await fromCore(core).catch(() => null)
    if (keys?.length) return { from: CORE_KEYMAP, keys }
  }
  const sources = HANDLERS.map((file) => join(root, file)).filter((file) => existsSync(file))
  return {
    from: HANDLERS.join(', '),
    keys: scanHandlers(sources.map((file) => readFileSync(file, 'utf8'))),
  }
}
