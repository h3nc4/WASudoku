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

import { loadWire } from './load'

const { init } = vi.hoisted(() => ({ init: vi.fn<() => Promise<unknown>>() }))

vi.mock('wasudoku-wasm', () => ({ default: init }))

describe('loadWire', () => {
  it('rejects a module that lacks the wire exports', async () => {
    init.mockResolvedValue({ memory: { buffer: new ArrayBuffer(1) } })
    await expect(loadWire()).rejects.toThrow(TypeError)
  })

  it('rejects when the module fails to instantiate', async () => {
    const failure = new Error('compile')
    init.mockRejectedValue(failure)
    await expect(loadWire()).rejects.toBe(failure)
  })
})
