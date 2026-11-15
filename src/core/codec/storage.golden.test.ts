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

/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  readGame,
  readMetrics,
  readPool,
  STORAGE_KEYS,
  writeGame,
  writeMetrics,
  writePool,
} from './storage'

interface GoldenGame {
  readonly label: string
  readonly text: string
  readonly legacy: string | null
}

interface Golden {
  readonly keys: unknown
  readonly games: readonly GoldenGame[]
  readonly metrics: readonly { readonly value: unknown; readonly text: string }[]
  readonly pool: { readonly value: unknown; readonly text: string }
}

// What the React app wrote to localStorage, played through its reducer before the cutover deleted it.
const GOLDEN: Golden = JSON.parse(
  readFileSync(resolve('src/core/codec/golden/saves.json'), 'utf8'),
) as Golden

// The custom grid saved these two before its first digit, and the app ignored them on the next load.
const UNTOUCHED = ['custom game, step 0', 'custom game, step 1']

const played = GOLDEN.games.filter(({ label }) => !UNTOUCHED.includes(label))
const legacy = GOLDEN.games.filter((game): game is GoldenGame & { legacy: string } =>
  Boolean(game.legacy),
)

describe('saves the React app wrote', () => {
  it('live under the same keys', () => {
    expect(STORAGE_KEYS).toEqual(GOLDEN.keys)
  })

  it('hold a full history, a redo tail and legacy saves', () => {
    expect(GOLDEN.games.some(({ label }) => label === 'a full history')).toBe(true)
    expect(GOLDEN.games.some(({ label }) => label === 'a history with a redo tail')).toBe(true)
    expect(legacy.length).toBeGreaterThan(1)
  })

  it.each(played.map((game) => [game.label, game.text]))(
    'reads %s and writes it back byte for byte',
    (_label, text) => {
      const loaded = readGame(text)
      if (loaded.status !== 'ok') throw new Error(loaded.status)
      expect(writeGame(loaded.value)).toBe(text)
    },
  )

  it.each(UNTOUCHED)('ignores the untouched %s', (label) => {
    const game = GOLDEN.games.find((entry) => entry.label === label)
    expect(readGame(game?.text ?? null)).toEqual({ status: 'absent' })
  })

  it.each(legacy.map((game) => [game.label, game]))(
    'migrates %s from the legacy format to what the app wrote after it',
    (_label, game) => {
      const loaded = readGame(game.legacy)
      if (loaded.status !== 'legacy') throw new Error(loaded.status)
      expect(writeGame(loaded.value)).toBe(game.text)
    },
  )

  it('reads and writes the metrics', () => {
    for (const { value, text } of GOLDEN.metrics) {
      expect(readMetrics(text)).toEqual({ status: 'ok', value })
      const loaded = readMetrics(text)
      if (loaded.status === 'ok') expect(writeMetrics(loaded.value)).toBe(text)
    }
  })

  it('reads and writes a refilled pool', () => {
    const loaded = readPool(GOLDEN.pool.text)
    expect(loaded).toEqual({ status: 'ok', value: GOLDEN.pool.value })
    if (loaded.status === 'ok') expect(writePool(loaded.value)).toBe(GOLDEN.pool.text)
  })
})
