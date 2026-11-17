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

import { describe, expect, it, vi } from 'vitest'

import { legacyGame, savedGame, STORAGE_KEYS } from '../../e2e/saves'
import { MemoryStorage } from '../test/runtime-fakes'
import { loadSlices, pageStorage, writeKey } from './storage'

const log = () => ({ error: vi.fn() })

describe('loadSlices', () => {
  it('reads each key absent from an empty store', () => {
    expect(loadSlices(new MemoryStorage(), log())).toEqual({
      game: { status: 'absent' },
      metrics: { status: 'absent' },
      pool: { status: 'absent' },
    })
  })

  it('decodes a current game, a legacy one and a corrupt key on their own', () => {
    const current = loadSlices(new MemoryStorage({ [STORAGE_KEYS.GAME]: savedGame() }), log())
    expect(current.game.status).toBe('ok')
    const legacy = loadSlices(
      new MemoryStorage({ [STORAGE_KEYS.GAME]: legacyGame(), [STORAGE_KEYS.METRICS]: '{' }),
      log(),
    )
    expect(legacy.game.status).toBe('legacy')
    expect(legacy.metrics.status).toBe('corrupt')
  })

  it('reads nothing, and logs, when storage refuses access', () => {
    const storage = new MemoryStorage()
    storage.getItem = () => {
      throw new DOMException('denied', 'SecurityError')
    }
    const logger = log()
    expect(loadSlices(storage, logger).game).toEqual({ status: 'absent' })
    expect(logger.error).toHaveBeenCalledTimes(3)
  })
})

describe('writeKey', () => {
  it('writes the text as given', () => {
    const storage = new MemoryStorage()
    writeKey(storage, STORAGE_KEYS.METRICS, '{"timer":1,"mistakes":0}', log())
    expect(storage.writes).toEqual([[STORAGE_KEYS.METRICS, '{"timer":1,"mistakes":0}']])
  })
})

describe('pageStorage', () => {
  const areas = () => ({ localStorage: new MemoryStorage(), sessionStorage: new MemoryStorage() })

  // The browser runner frames each test, while jsdom runs it at the top.
  it('is the real page area for where it runs', () => {
    const framed = globalThis.self !== globalThis.top
    expect(pageStorage(globalThis)).toBe(framed ? sessionStorage : localStorage)
  })

  it('is sessionStorage inside a frame', () => {
    const page = { ...areas(), self: {}, top: {} }
    expect(pageStorage(page)).toBe(page.sessionStorage)
  })

  it('is localStorage in a top-level page', () => {
    const self = {}
    const page = { ...areas(), self, top: self }
    expect(pageStorage(page)).toBe(page.localStorage)
  })

  it('keeps nothing when the property throws', () => {
    const page = {
      ...areas(),
      self: globalThis,
      top: globalThis,
      get localStorage(): Storage {
        throw new DOMException('denied', 'SecurityError')
      },
    }
    const storage = pageStorage(page)
    storage.setItem('k', 'v')
    expect(storage.getItem('k')).toBeNull()
  })
})
