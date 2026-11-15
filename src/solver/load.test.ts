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

// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadWire } from './load'

// The smallest valid module, the magic number and version 1 with no sections, so it exports nothing.
const EMPTY_MODULE = Uint8Array.of(0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00)
const WASM = { 'Content-Type': 'application/wasm' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadWire', () => {
  it('fetches the module it was built with', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(EMPTY_MODULE, { headers: WASM })))
    vi.stubGlobal('fetch', fetch)
    await loadWire().catch(() => undefined)
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/wasudoku_wasm\.wasm$/))
  })

  it('rejects a module that lacks the wire exports', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(EMPTY_MODULE, { headers: WASM })))
    await expect(loadWire()).rejects.toThrow(TypeError)
  })

  it('rejects when the module fails to download', async () => {
    const failure = new Error('offline')
    vi.stubGlobal('fetch', () => Promise.reject(failure))
    await expect(loadWire()).rejects.toBe(failure)
  })
})
