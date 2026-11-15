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

/** The one origin every canonical link names, whichever host serves the build. */
export const SITE = 'https://wasudoku.h3nc4.com'

export const SITE_NAME = 'WASudoku'

export const APP_PATH = '/'
export const SOLVER_PATH = '/solver/'
export const techniquePath = (slug: string): string => `/techniques/${slug}/`

export interface PageLink {
  readonly href: string
  readonly label: string
}

const PREVIEW_IMAGE = `${SITE}/wasudoku-preview.png`
const PREVIEW_WIDTH = '2292'
const PREVIEW_HEIGHT = '1200'

const AUTHOR = { '@type': 'Person', name: 'Henrique Almeida', url: 'https://h3nc4.com' }
const LICENSE = 'https://www.gnu.org/licenses/agpl-3.0.html'

export type JsonLd = Readonly<Record<string, unknown>>

/** What one page says about itself in its head. */
export interface PageMeta {
  readonly title: string
  readonly description: string
  /** The path from the site root, which the canonical link and og:url name. */
  readonly path: string
  readonly type: 'website' | 'article'
  readonly jsonLd: JsonLd
}

export interface MetaTag {
  readonly key: string
  readonly content: string
}

/** The head of a page, every value ready for the markup. */
export interface Head {
  readonly title: string
  readonly description: string
  readonly canonical: string
  /** Open Graph tags, written with `property=`. */
  readonly og: readonly MetaTag[]
  /** X card tags, written with `name=` as X documents them. */
  readonly twitter: readonly MetaTag[]
  readonly jsonLd: string
}

export const canonicalUrl = (path: string): string => new URL(path, SITE).href

// A data block ends at the first "</script", so every "<" is escaped as JSON allows.
export const jsonLdText = (data: JsonLd): string => JSON.stringify(data).replaceAll('<', '\\u003c')

export function headOf(meta: PageMeta): Head {
  const url = canonicalUrl(meta.path)
  return {
    title: meta.title,
    description: meta.description,
    canonical: url,
    og: [
      { key: 'og:type', content: meta.type },
      { key: 'og:site_name', content: SITE_NAME },
      { key: 'og:url', content: url },
      { key: 'og:title', content: meta.title },
      { key: 'og:description', content: meta.description },
      { key: 'og:image', content: PREVIEW_IMAGE },
      { key: 'og:image:secure_url', content: PREVIEW_IMAGE },
      { key: 'og:image:type', content: 'image/png' },
      { key: 'og:image:width', content: PREVIEW_WIDTH },
      { key: 'og:image:height', content: PREVIEW_HEIGHT },
    ],
    twitter: [
      { key: 'twitter:card', content: 'summary_large_image' },
      { key: 'twitter:url', content: url },
      { key: 'twitter:title', content: meta.title },
      { key: 'twitter:description', content: meta.description },
      { key: 'twitter:image', content: PREVIEW_IMAGE },
    ],
    jsonLd: jsonLdText(meta.jsonLd),
  }
}

const APP_DESCRIPTION = 'A Sudoku solver that runs locally in your browser using WebAssembly.'

/** The app itself, which structured data describes as a free web application. */
export const APP_META: PageMeta = {
  title: SITE_NAME,
  description: APP_DESCRIPTION,
  path: APP_PATH,
  type: 'website',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: canonicalUrl(APP_PATH),
    description: APP_DESCRIPTION,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires JavaScript and WebAssembly',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    license: LICENSE,
    author: AUTHOR,
  },
}

/** An article on this site, by the app's author. */
export const articleLd = (
  type: 'Article' | 'TechArticle',
  { title, description, path }: Pick<PageMeta, 'title' | 'description' | 'path'>,
  about: string,
): JsonLd => ({
  '@context': 'https://schema.org',
  '@type': type,
  headline: title,
  description,
  url: canonicalUrl(path),
  mainEntityOfPage: canonicalUrl(path),
  about,
  inLanguage: 'en',
  author: AUTHOR,
  isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: canonicalUrl(APP_PATH) },
  license: LICENSE,
})
