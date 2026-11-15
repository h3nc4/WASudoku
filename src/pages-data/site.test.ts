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

import { APP_META, canonicalUrl, headOf, jsonLdText, techniquePath } from './site'

describe('headOf', () => {
  const head = headOf({
    title: 'X-Wing',
    description: 'A fish.',
    path: techniquePath('x-wing'),
    type: 'article',
    jsonLd: { '@type': 'Article' },
  })

  it('names the canonical url in the link, og:url and twitter:url', () => {
    const url = 'https://wasudoku.h3nc4.com/techniques/x-wing/'
    expect(head.canonical).toBe(url)
    expect(head.og).toContainEqual({ key: 'og:url', content: url })
    expect(head.og).toContainEqual({ key: 'og:type', content: 'article' })
    expect(head.twitter).toContainEqual({ key: 'twitter:url', content: url })
    expect(head.twitter).toContainEqual({ key: 'twitter:title', content: 'X-Wing' })
  })

  it('writes the structured data as JSON', () => {
    expect(JSON.parse(head.jsonLd)).toEqual({ '@type': 'Article' })
  })
})

describe('jsonLdText', () => {
  it('escapes every < so the data cannot close its script element', () => {
    const text = jsonLdText({ name: '</script><b>' })
    expect(text).not.toContain('<')
    expect(JSON.parse(text)).toEqual({ name: '</script><b>' })
  })
})

describe('APP_META', () => {
  it('describes the app as a free web application at the root', () => {
    expect(canonicalUrl(APP_META.path)).toBe('https://wasudoku.h3nc4.com/')
    expect(APP_META.jsonLd).toMatchObject({
      '@type': 'WebApplication',
      isAccessibleForFree: true,
      offers: { price: '0' },
    })
  })
})
