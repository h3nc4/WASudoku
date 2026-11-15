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

import { describe, expect, it } from 'vitest'

import { BOARD_LENGTH } from '../core/codec/wire'
import { parseRequest, parseResponse, PROTOCOL_VERSION } from './protocol'

const v = PROTOCOL_VERSION
const cells = new Uint8Array(BOARD_LENGTH)

describe('parseRequest', () => {
  it.each(['solve', 'validate', 'hint'])('reads a %s request', (kind) => {
    expect(parseRequest({ v, id: 3, kind, cells, extra: true })).toEqual({ v, id: 3, kind, cells })
  })

  it('reads a generate request', () => {
    const request = { v, id: 0, kind: 'generate', difficulty: 'expert', seed: 2 ** 40 }
    expect(parseRequest(request)).toEqual(request)
  })

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a number', 7],
    ['another version', { v: 2, id: 1, kind: 'solve', cells }],
    ['no version', { id: 1, kind: 'solve', cells }],
    ['a negative id', { v, id: -1, kind: 'solve', cells }],
    ['a fractional id', { v, id: 1.5, kind: 'solve', cells }],
    ['a string id', { v, id: '1', kind: 'solve', cells }],
    ['an unknown kind', { v, id: 1, kind: 'explode', cells }],
    ['a short board', { v, id: 1, kind: 'solve', cells: new Uint8Array(3) }],
    ['a board of another type', { v, id: 1, kind: 'solve', cells: new Int8Array(BOARD_LENGTH) }],
    ['a board as a list', { v, id: 1, kind: 'hint', cells: Array.from(cells) }],
    ['a board as a buffer', { v, id: 1, kind: 'hint', cells: cells.buffer }],
    ['a generate with cells', { v, id: 1, kind: 'generate', cells }],
    ['an unknown difficulty', { v, id: 1, kind: 'generate', difficulty: 'hardest', seed: 1 }],
    ['a negative seed', { v, id: 1, kind: 'generate', difficulty: 'easy', seed: -1 }],
    ['an unsafe seed', { v, id: 1, kind: 'generate', difficulty: 'easy', seed: 2 ** 53 }],
    ['no seed', { v, id: 1, kind: 'generate', difficulty: 'easy' }],
  ])('refuses %s', (_, data) => {
    expect(parseRequest(data)).toBeNull()
  })
})

describe('parseResponse', () => {
  it('reads wire bytes', () => {
    const bytes = new ArrayBuffer(4)
    expect(parseResponse({ v, id: 9, bytes })).toEqual({ v, id: 9, bytes })
  })

  it.each(['load', 'trap'])('reads a %s fault', (fault) => {
    expect(parseResponse({ v, id: 9, fault })).toEqual({ v, id: 9, fault })
  })

  it.each([
    ['null', null],
    ['another version', { v: 0, id: 1, bytes: new ArrayBuffer(1) }],
    ['no id', { v, bytes: new ArrayBuffer(1) }],
    ['a view instead of a buffer', { v, id: 1, bytes: new Uint8Array(1) }],
    ['a list of bytes', { v, id: 1, bytes: [1, 2] }],
    ['an unknown fault', { v, id: 1, fault: 'oops' }],
    ['neither bytes nor a fault', { v, id: 1 }],
  ])('refuses %s', (_, data) => {
    expect(parseResponse(data)).toBeNull()
  })
})
