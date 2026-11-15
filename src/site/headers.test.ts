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

import {
  contentSecurityPolicy,
  formatHeaders,
  FRAME_ANCESTORS,
  headerRules,
  headersFor,
  inlineSources,
  parseHeaders,
  sourceHash,
} from './headers'

describe('inlineSources', () => {
  it('collects inline scripts and styles across pages, each once and in order', () => {
    const pages = [
      '<head><script>b()</script><style>p{}</style><script type="module">a()</script></head>',
      '<style media="print">p{}</style><style>a{}</style><script>b()</script>',
    ]
    expect(inlineSources(pages)).toEqual({
      scripts: ['a()', 'b()'],
      styles: ['a{}', 'p{}'],
    })
  })

  it('leaves out a script that loads a file and a data block that never runs', () => {
    const page = [
      '<script type="module" src="/assets/app.js"></script>',
      '<script type="application/ld+json">{"@type":"WebApplication"}</script>',
      "<script type='application/json'>{}</script>",
    ].join('')
    expect(inlineSources([page])).toEqual({ scripts: [], styles: [] })
  })

  it('keeps the exact text a hash must match, whitespace included', () => {
    expect(inlineSources(['<style>\n  a {}\n</style>']).styles).toEqual(['\n  a {}\n'])
  })
})

describe('sourceHash', () => {
  it('names the base64 SHA-256 of the text as a CSP source', () => {
    // printf '' | openssl dgst -sha256 -binary | base64
    expect(sourceHash('')).toBe("'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='")
  })
})

describe('contentSecurityPolicy', () => {
  it('allows the wasm and the hashed inline sources and nothing from elsewhere', () => {
    const policy = contentSecurityPolicy({ scripts: ['a()'], styles: ['p{}', 'a{}'] })
    expect(policy.split('; ')).toEqual([
      "default-src 'self'",
      `script-src 'self' 'wasm-unsafe-eval' ${sourceHash('a()')}`,
      `style-src 'self' ${sourceHash('p{}')} ${sourceHash('a{}')}`,
      "img-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self'",
      "base-uri 'none'",
      FRAME_ANCESTORS,
    ])
  })

  it('adds no source for a page without inline code', () => {
    const policy = contentSecurityPolicy({ scripts: [], styles: [] })
    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval';")
    expect(policy).toContain("style-src 'self';")
  })
})

describe('headerRules', () => {
  const rules = headerRules('report-only policy')
  const names = (pathname: string) => headersFor(rules, pathname).map(([name]) => name)

  it('gives every path, a missing one included, the security set once', () => {
    for (const pathname of ['/', '/no-such-page', '/assets/a.js', '/sw.js']) {
      const headers = names(pathname)
      expect(headers).toEqual(expect.arrayContaining(['Content-Security-Policy-Report-Only']))
      expect(new Set(headers).size).toBe(headers.length)
    }
  })

  it('enforces only frame-ancestors and reports the rest', () => {
    const headers = new Map(headersFor(rules, '/'))
    expect(headers.get('Content-Security-Policy')).toBe(FRAME_ANCESTORS)
    expect(headers.get('Content-Security-Policy-Report-Only')).toBe('report-only policy')
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin')
    expect(headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin')
    expect(headers.has('Cross-Origin-Embedder-Policy')).toBe(false)
  })

  it.each([
    ['/', 'no-cache'],
    ['/index.html', 'no-cache'],
    ['/sw.js', 'no-cache'],
    ['/assets/app.js', 'public, max-age=31536000, immutable'],
    ['/manifest.json', undefined],
  ])('caches %s with %s', (pathname, value) => {
    expect(new Map(headersFor(rules, pathname)).get('Cache-Control')).toBe(value)
  })
})

describe('formatHeaders and parseHeaders', () => {
  it('read back the rules they wrote', () => {
    const rules = headerRules('policy')
    const text = formatHeaders(rules)
    expect(text.startsWith('# ')).toBe(true)
    expect(text.endsWith('immutable\n')).toBe(true)
    expect(parseHeaders(text)).toEqual(rules)
  })

  it('skip a header before any path and a header without a value', () => {
    expect(parseHeaders('  Early: yes\n/a\n  Empty:\n  Kept: 1 \n')).toEqual([
      { path: '/a', headers: [['Kept', '1']] },
    ])
  })
})
