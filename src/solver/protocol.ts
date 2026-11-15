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

import { BOARD_LENGTH } from '../core/codec/wire'
import { DIFFICULTIES, type Difficulty } from '../core/codec/wire.types'

/** The version of every message between the client and the worker, which come from one build. */
export const PROTOCOL_VERSION = 1

/** A task that sends a board of 81 cell bytes. */
export type BoardKind = 'solve' | 'validate' | 'hint'

export type Kind = BoardKind | 'generate'

export type Request =
  | {
      readonly v: typeof PROTOCOL_VERSION
      readonly id: number
      readonly kind: BoardKind
      readonly cells: Uint8Array
    }
  | {
      readonly v: typeof PROTOCOL_VERSION
      readonly id: number
      readonly kind: 'generate'
      readonly difficulty: Difficulty
      /** A non-negative safe integer, the same puzzle for the same seed. */
      readonly seed: number
    }

/** The worker answers without wire bytes when its module failed to load or an export trapped. */
export type Fault = 'load' | 'trap'

export type Response =
  | { readonly v: typeof PROTOCOL_VERSION; readonly id: number; readonly bytes: ArrayBuffer }
  | { readonly v: typeof PROTOCOL_VERSION; readonly id: number; readonly fault: Fault }

const BOARD_KINDS: readonly unknown[] = ['solve', 'validate', 'hint'] satisfies BoardKind[]
const FAULTS: readonly unknown[] = ['load', 'trap'] satisfies Fault[]

type Fields = (name: string) => unknown

// Tag checks rather than instanceof, which fails for a value from another realm such as a test's jsdom.
const tagOf = (value: unknown): string => Object.prototype.toString.call(value)

const isBuffer = (value: unknown): value is ArrayBuffer => tagOf(value) === '[object ArrayBuffer]'

const isBoard = (value: unknown): value is Uint8Array =>
  ArrayBuffer.isView(value) &&
  tagOf(value) === '[object Uint8Array]' &&
  value.byteLength === BOARD_LENGTH

const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const isDifficulty = (value: unknown): value is Difficulty =>
  DIFFICULTIES.some((difficulty) => difficulty === value)

const isFault = (value: unknown): value is Fault => FAULTS.includes(value)

const isBoardKind = (value: unknown): value is BoardKind => BOARD_KINDS.includes(value)

/** The fields of a message of this protocol's version with a valid id, or null. */
function envelope(data: unknown): { id: number; get: Fields } | null {
  if (typeof data !== 'object' || data === null) return null
  const get: Fields = (name) => Reflect.get(data, name)
  const id = get('id')
  if (get('v') !== PROTOCOL_VERSION || !isId(id)) return null
  return { id, get }
}

/** The request `data` holds, or null for anything that is not a valid request. */
export function parseRequest(data: unknown): Request | null {
  const message = envelope(data)
  if (message === null) return null
  const { id, get } = message
  const kind = get('kind')
  const cells = get('cells')
  if (isBoardKind(kind) && isBoard(cells)) return { v: PROTOCOL_VERSION, id, kind, cells }
  const difficulty = get('difficulty')
  const seed = get('seed')
  if (kind === 'generate' && isDifficulty(difficulty) && isId(seed)) {
    return { v: PROTOCOL_VERSION, id, kind, difficulty, seed }
  }
  return null
}

/** The response `data` holds, or null for anything that is not a valid response. */
export function parseResponse(data: unknown): Response | null {
  const message = envelope(data)
  if (message === null) return null
  const { id, get } = message
  const bytes = get('bytes')
  const fault = get('fault')
  if (isBuffer(bytes)) return { v: PROTOCOL_VERSION, id, bytes }
  if (isFault(fault)) return { v: PROTOCOL_VERSION, id, fault }
  return null
}
