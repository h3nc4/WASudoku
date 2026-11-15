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

import { createHash } from 'node:crypto'

/** The text of every inline script and stylesheet a build's pages hold, each listed once. */
export interface InlineSources {
  readonly scripts: readonly string[]
  readonly styles: readonly string[]
}

export type Header = readonly [name: string, value: string]

/** One path pattern of a Cloudflare `_headers` file and the headers it adds. */
export interface HeaderRule {
  readonly path: string
  readonly headers: readonly Header[]
}

const INLINE_SCRIPT = /<script\b(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/gi
const INLINE_STYLE = /<style\b[^>]*>[\s\S]*?<\/style>/gi
// A data block never runs. CSP ignores it and it doesn't need a hash.
const DATA_BLOCK = /\stype=["']?application\/(?:ld\+)?json/i

/** The attributes and the body of an element the patterns above matched whole. */
function split(element: string) {
  const open = element.indexOf('>')
  return { tag: element.slice(0, open), body: element.slice(open + 1, element.lastIndexOf('</')) }
}

const unique = (values: readonly string[]) => [...new Set(values)].sort()

/** The inline scripts and styles across pages, which a hash in the policy has to allow. */
export function inlineSources(pages: readonly string[]): InlineSources {
  const elements = (pattern: RegExp) => pages.flatMap((page) => [...page.matchAll(pattern)])
  const scripts = elements(INLINE_SCRIPT)
    .map(([element]) => split(element))
    .filter(({ tag }) => !DATA_BLOCK.test(tag))
  return {
    scripts: unique(scripts.map(({ body }) => body)),
    styles: unique(elements(INLINE_STYLE).map(([element]) => split(element).body)),
  }
}

/** A CSP source that allows exactly this inline text. */
export const sourceHash = (text: string): string =>
  `'sha256-${createHash('sha256').update(text).digest('base64')}'`

/** The portfolio embeds the app in a DeviceFrame, which X-Frame-Options SAMEORIGIN would refuse. */
export const FRAME_ANCESTORS = "frame-ancestors 'self' https://h3nc4.com https://www.h3nc4.com"

/** The strict policy, with a hash for each inline script and stylesheet the pages hold. */
export function contentSecurityPolicy({ scripts, styles }: InlineSources): string {
  return [
    "default-src 'self'",
    ["script-src 'self' 'wasm-unsafe-eval'", ...scripts.map(sourceHash)].join(' '),
    ["style-src 'self'", ...styles.map(sourceHash)].join(' '),
    "img-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "base-uri 'none'",
    FRAME_ANCESTORS,
  ].join('; ')
}

const NO_CACHE = 'no-cache'

/** The edge's rules for a build, with the strict policy reported rather than enforced for now. */
export const headerRules = (reportOnly: string): HeaderRule[] => [
  {
    // Every response, a 404 included. A worker script takes its own policy from these too.
    path: '/*',
    headers: [
      ['X-Content-Type-Options', 'nosniff'],
      ['Strict-Transport-Security', 'max-age=31536000'],
      ['Referrer-Policy', 'strict-origin-when-cross-origin'],
      ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'],
      ['Cross-Origin-Opener-Policy', 'same-origin'],
      ['Cross-Origin-Resource-Policy', 'same-origin'],
      // Enforced, since the zone adds X-Frame-Options and only an enforced frame-ancestors overrides it.
      ['Content-Security-Policy', FRAME_ANCESTORS],
      ['Content-Security-Policy-Report-Only', reportOnly],
    ],
  },
  // no-cache rather than no-store, which keeps the page out of the back-forward cache.
  { path: '/', headers: [['Cache-Control', NO_CACHE]] },
  { path: '/index.html', headers: [['Cache-Control', NO_CACHE]] },
  // Unhashed, so a cached copy would hold back every later deploy.
  { path: '/sw.js', headers: [['Cache-Control', NO_CACHE]] },
  // The build fingerprints everything under here. A name never changes meaning.
  { path: '/assets/*', headers: [['Cache-Control', 'public, max-age=31536000, immutable']] },
]

const GENERATED = '# Written by the build from src/site/headers.ts. Edit that file instead.'

/** The rules as a `_headers` file. */
export const formatHeaders = (rules: readonly HeaderRule[]): string =>
  [
    GENERATED,
    ...rules.map(({ path, headers }) =>
      [path, ...headers.map(([name, value]) => `  ${name}: ${value}`)].join('\n'),
    ),
  ].join('\n\n') + '\n'

const HEADER_LINE = /^\s+([\w-]+):\s*(.*)$/

/** Reads a `_headers` file back, skipping comments and blank lines. */
export function parseHeaders(text: string): HeaderRule[] {
  const rules: { path: string; headers: [string, string][] }[] = []
  for (const line of text.split('\n')) {
    if (line.startsWith('/')) rules.push({ path: line.trim(), headers: [] })
    const [, name, value] = HEADER_LINE.exec(line) ?? []
    if (name && value) rules.at(-1)?.headers.push([name, value.trim()])
  }
  return rules
}

/** A trailing `*` is a splat that matches any rest of the path, the empty rest included. */
const matches = (pattern: string, pathname: string) =>
  pattern.endsWith('*') ? pathname.startsWith(pattern.slice(0, -1)) : pathname === pattern

/** The headers the edge adds to a path, from the rules that match it in file order. */
export const headersFor = (rules: readonly HeaderRule[], pathname: string): Header[] =>
  rules.filter(({ path }) => matches(path, pathname)).flatMap(({ headers }) => [...headers])
