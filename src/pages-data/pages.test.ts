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

// Renders the pages as the build does and reads back what a crawler gets from each head.
import { readdirSync } from 'node:fs'

import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

import { TECHNIQUES } from '../core/game/steps'
import Index from '../pages/index.astro'
import Solver from '../pages/solver.astro'
import Technique from '../pages/techniques/[slug].astro'
import { techniquePaths } from './techniques'

const container = await AstroContainer.create()
const SITE = 'https://wasudoku.h3nc4.com'

const parse = (html: string) => new JSDOM(html).window.document

const techniques = await Promise.all(
  techniquePaths().map(async ({ params, props }) => ({
    path: `/techniques/${params.slug}/`,
    doc: parse(await container.renderToString(Technique, { params, props })),
  })),
)
const pages = [
  { path: '/', doc: parse(await container.renderToString(Index)) },
  { path: '/solver/', doc: parse(await container.renderToString(Solver)) },
  ...techniques,
]

const canonical = (doc: Document) =>
  doc.querySelector('link[rel="canonical"]')?.getAttribute('href')
const meta = (doc: Document, selector: string) =>
  doc.querySelector(selector)?.getAttribute('content')

function jsonLd(doc: Document): unknown {
  const blocks = doc.querySelectorAll('script[type="application/ld+json"]')
  expect(blocks).toHaveLength(1)
  return JSON.parse(blocks[0]?.textContent ?? '')
}

describe('every page', () => {
  it.each(pages.map((page) => [page.path, page] as const))(
    '%s names itself as canonical, in og:url and in twitter:url',
    (path, { doc }) => {
      expect(canonical(doc)).toBe(`${SITE}${path}`)
      expect(meta(doc, 'meta[property="og:url"]')).toBe(`${SITE}${path}`)
      expect(meta(doc, 'meta[name="twitter:url"]')).toBe(`${SITE}${path}`)
      expect(meta(doc, 'meta[property="og:title"]')).toBe(doc.title)
      expect(meta(doc, 'meta[name="description"]')).toBe(
        meta(doc, 'meta[property="og:description"]'),
      )
      expect(doc.querySelectorAll('h1')).toHaveLength(1)
    },
  )

  it('links only to pages and files the build holds', () => {
    const publicFiles = readdirSync('public').map((name) => `/${name}`)
    const known = new Set([...pages.map(({ path }) => path), ...publicFiles])
    for (const { path, doc } of pages) {
      for (const element of doc.querySelectorAll('a[href]')) {
        const url = new URL(element.getAttribute('href') ?? '', `${SITE}${path}`)
        if (url.origin !== SITE) continue
        expect(known, `${path} links to ${url.pathname}`).toContain(url.pathname)
        if (url.hash !== '') {
          const target = pages.find((page) => page.path === url.pathname)
          expect(target?.doc.getElementById(url.hash.slice(1)), url.href).not.toBeNull()
        }
      }
    }
  })
})

describe('the app', () => {
  const [app] = pages

  it('describes itself as a WebApplication', () => {
    expect(jsonLd(app?.doc ?? parse(''))).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      url: `${SITE}/`,
      applicationCategory: 'GameApplication',
    })
  })

  it('keeps the footer to the copyright link, as today', () => {
    const links = [...(app?.doc.querySelectorAll('footer a') ?? [])].map((a) =>
      a.getAttribute('href'),
    )
    expect(links).toEqual(['https://h3nc4.com'])
  })
})

describe('the solver page', () => {
  const doc = pages[1]?.doc ?? parse('')

  it('explains logic, the technique order and backtracking under their headings', () => {
    expect(doc.querySelector('h1')?.textContent).toBe('How the solver works')
    expect([...doc.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Logic first',
      'Technique order',
      'Then backtracking',
    ])
    expect(jsonLd(doc)).toMatchObject({ '@type': 'TechArticle', url: `${SITE}/solver/` })
  })

  it('links every technique from its table, in solver order', () => {
    const links = [...doc.querySelectorAll('table a')].map((a) => a.getAttribute('href'))
    expect(links).toHaveLength(TECHNIQUES.length - 1)
    expect(links[0]).toBe('/techniques/naked-single/')
    expect(links.at(-1)).toBe('/techniques/w-wing/')
  })
})

describe('the technique pages', () => {
  it('make one page per technique the solver emits', () => {
    expect(techniques).toHaveLength(TECHNIQUES.length)
    expect(new Set(techniques.map(({ path }) => path)).size).toBe(TECHNIQUES.length)
  })

  it.each(techniques.map((page) => [page.path, page] as const))(
    '%s is an article with a described figure and a link into the app',
    (path, { doc }) => {
      const name = doc.querySelector('h1')?.textContent ?? ''
      expect(jsonLd(doc)).toMatchObject({ '@type': 'Article', url: `${SITE}${path}` })
      expect(doc.title).toBe(`${name} Sudoku technique - WASudoku`)
      const figure = doc.querySelector('figure')
      expect(figure?.querySelector('.board')?.getAttribute('aria-hidden')).toBe('true')
      expect(figure?.querySelectorAll('.board > [role="row"] > .c')).toHaveLength(81)
      expect(figure?.querySelector('[tabindex], [id]')).toBeNull()
      expect(figure?.querySelector('figcaption p')?.textContent).toMatch(/solver's test corpus/)
      expect(figure?.querySelectorAll('figcaption li').length).toBeGreaterThan(0)
      expect(doc.querySelector('a.play')?.getAttribute('href')).toMatch(/^\/\?p=[0-9.]{81}$/)
    },
  )
})
