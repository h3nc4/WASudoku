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

// The application/x-www-form-urlencoded parser and serializer of the URL Standard, which
// URLSearchParams implements, written out because the core has no URL or TextDecoder.

const HEX = 16
const REPLACEMENT = '�'
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g
const PERCENT_BYTE = /%([0-9A-F]{2})|./gs
const ESCAPED_HEX = /^[0-9A-Fa-f]{2}$/
const ESCAPE_LENGTH = 2
// encodeURIComponent leaves these alone, while the form serializer escapes them.
const FORM_ESCAPED = /[!'()~]/g

/** The code of a one-character string, always ASCII here, so a code point and a code unit agree. */
const codeOf = (char: string): number => Number(char.codePointAt(0))

const PERCENT = codeOf('%')

/** Lone surrogates become U+FFFD, as every URL API converts a string to scalar values. */
const toScalars = (text: string): string => text.replaceAll(LONE_SURROGATE, REPLACEMENT)

/** UTF-8 bytes of a string, read back off encodeURIComponent's escapes. */
const utf8 = (text: string): number[] =>
  Array.from(encodeURIComponent(toScalars(text)).matchAll(PERCENT_BYTE), ([char, hex]) =>
    hex === undefined ? codeOf(char) : Number.parseInt(hex, HEX),
  )

/** Percent-decodes a string into bytes, keeping a % that starts no valid escape. */
function percentDecode(text: string): number[] {
  const bytes = utf8(text)
  const out: number[] = []
  let skip = 0
  bytes.forEach((byte, i) => {
    if (skip > 0) {
      skip--
      return
    }
    const hex = String.fromCodePoint(...bytes.slice(i + 1, i + 1 + ESCAPE_LENGTH))
    if (byte === PERCENT && ESCAPED_HEX.test(hex)) {
      out.push(Number.parseInt(hex, HEX))
      skip = ESCAPE_LENGTH
    } else {
      out.push(byte)
    }
  })
  return out
}

const ASCII_END = 0x80
const CONTINUATION_PAYLOAD = 0x3f
const CONTINUATION_BITS = 6
const LOWEST_CONTINUATION = 0x80
const HIGHEST_CONTINUATION = 0xbf

/** A lead byte: the continuation bytes it needs, its payload mask and the bounds of its second byte. */
interface Lead {
  readonly first: number
  readonly last: number
  readonly needed: number
  readonly payload: number
  readonly lower?: { readonly byte: number; readonly bound: number }
  readonly upper?: { readonly byte: number; readonly bound: number }
}

const LEADS: readonly Lead[] = [
  { first: 0xc2, last: 0xdf, needed: 1, payload: 0x1f },
  {
    first: 0xe0,
    last: 0xef,
    needed: 2,
    payload: 0x0f,
    lower: { byte: 0xe0, bound: 0xa0 },
    upper: { byte: 0xed, bound: 0x9f },
  },
  {
    first: 0xf0,
    last: 0xf4,
    needed: 3,
    payload: 0x07,
    lower: { byte: 0xf0, bound: 0x90 },
    upper: { byte: 0xf4, bound: 0x8f },
  },
]

/** A lead's continuation bytes from `start`, as far as they stay in bounds, and the code point they build. */
function continuation(
  bytes: readonly number[],
  start: number,
  byte: number,
  lead: Lead,
): { readonly codePoint: number; readonly seen: number } {
  let codePoint = byte & lead.payload
  let lower = lead.lower?.byte === byte ? lead.lower.bound : LOWEST_CONTINUATION
  let upper = lead.upper?.byte === byte ? lead.upper.bound : HIGHEST_CONTINUATION
  let seen = 0
  while (seen < lead.needed) {
    const next = bytes[start + seen]
    if (next === undefined || next < lower || next > upper) break
    codePoint = (codePoint << CONTINUATION_BITS) | (next & CONTINUATION_PAYLOAD)
    lower = LOWEST_CONTINUATION
    upper = HIGHEST_CONTINUATION
    seen++
  }
  return { codePoint, seen }
}

/** The UTF-8 decoder of the Encoding Standard, one U+FFFD per maximal invalid subpart. */
function utf8Decode(bytes: readonly number[]): string {
  let out = ''
  let i = 0
  for (let byte = bytes[i]; byte !== undefined; byte = bytes[i]) {
    i++
    if (byte < ASCII_END) {
      out += String.fromCodePoint(byte)
      continue
    }
    const lead = LEADS.find((candidate) => byte >= candidate.first && byte <= candidate.last)
    if (lead === undefined) {
      out += REPLACEMENT
      continue
    }
    const { codePoint, seen } = continuation(bytes, i, byte, lead)
    i += seen
    out += seen === lead.needed ? String.fromCodePoint(codePoint) : REPLACEMENT
  }
  return out
}

const decodePart = (text: string): string => utf8Decode(percentDecode(text.replaceAll('+', ' ')))

export type QueryPair = readonly [name: string, value: string]

/** Parses the query of an address, which keeps any '?' it starts with, as URL.searchParams does. */
export const parsePairs = (query: string): QueryPair[] =>
  query
    .split('&')
    .filter((sequence) => sequence !== '')
    .map((sequence) => {
      const at = sequence.indexOf('=')
      const name = at < 0 ? sequence : sequence.slice(0, at)
      const value = at < 0 ? '' : sequence.slice(at + 1)
      return [decodePart(name), decodePart(value)] as const
    })

/** Parses a query string, with or without its leading '?', as new URLSearchParams(search) does. */
export const parseQuery = (search: string): QueryPair[] =>
  parsePairs(search.startsWith('?') ? search.slice(1) : search)

const encodePart = (text: string): string =>
  encodeURIComponent(toScalars(text))
    .replaceAll(FORM_ESCAPED, (char) => `%${codeOf(char).toString(HEX).toUpperCase()}`)
    .replaceAll('%20', '+')

/** Serializes pairs as URLSearchParams does, without a leading '?'. */
export const serializeQuery = (pairs: readonly QueryPair[]): string =>
  pairs.map(([name, value]) => `${encodePart(name)}=${encodePart(value)}`).join('&')

/** Splits an absolute address into the part before its query, the query and the fragment. */
export function splitHref(href: string): { base: string; query: string | null; hash: string } {
  const hashAt = href.indexOf('#')
  const beforeHash = hashAt < 0 ? href : href.slice(0, hashAt)
  const hash = hashAt < 0 ? '' : href.slice(hashAt)
  const queryAt = beforeHash.indexOf('?')
  return queryAt < 0
    ? { base: beforeHash, query: null, hash }
    : { base: beforeHash.slice(0, queryAt), query: beforeHash.slice(queryAt + 1), hash }
}
