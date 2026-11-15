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

import type { Technique } from '../core/game/steps'
import { techniqueName } from '../core/text/techniques'
import { CORPUS, type CorpusPuzzle } from './corpus'
import { type Example, stuckExample, techniqueExample } from './examples'
import { GUIDES } from './guides'
import { APP_PATH, articleLd, type PageLink, type PageMeta, SITE_NAME, techniquePath } from './site'

/** The levels the Rust solver grades a step by, which the generator's difficulties are built on. */
export type Level = 'Basic' | 'Intermediate' | 'Advanced' | 'Master'

/** One finder of the logical solver, with the techniques it reports. */
export interface Finder {
  readonly techniques: readonly Technique[]
  readonly level: Level
}

/** Every finder in the order logical_solver/mod.rs tries them, which a test reads back from the source. */
export const FINDERS: readonly Finder[] = [
  { techniques: ['NakedSingle'], level: 'Basic' },
  { techniques: ['HiddenSingle'], level: 'Basic' },
  { techniques: ['NakedPair'], level: 'Intermediate' },
  { techniques: ['NakedTriple'], level: 'Intermediate' },
  { techniques: ['PointingPair', 'PointingTriple'], level: 'Intermediate' },
  { techniques: ['HiddenPair'], level: 'Intermediate' },
  { techniques: ['HiddenTriple'], level: 'Intermediate' },
  { techniques: ['ClaimingCandidate'], level: 'Intermediate' },
  { techniques: ['X-Wing', 'Swordfish', 'Jellyfish'], level: 'Advanced' },
  { techniques: ['XY-Wing'], level: 'Advanced' },
  { techniques: ['XYZ-Wing'], level: 'Advanced' },
  { techniques: ['Skyscraper'], level: 'Advanced' },
  { techniques: ['TwoStringKite'], level: 'Advanced' },
  { techniques: ['UniqueRectangleType1'], level: 'Master' },
  { techniques: ['W-Wing'], level: 'Master' },
]

/** The fish finder reports Jellyfish at the Master level, above the finder's own. */
const LEVEL_OVERRIDES: Partial<Record<Technique, Level>> = { Jellyfish: 'Master' }

/** The logical techniques in solver order, then the search that finishes what they leave. */
export const PAGE_ORDER: readonly Technique[] = [
  ...FINDERS.flatMap(({ techniques }) => techniques),
  'Backtracking',
]

export const levelOf = (technique: Technique): Level | null =>
  LEVEL_OVERRIDES[technique] ??
  FINDERS.find(({ techniques }) => techniques.includes(technique))?.level ??
  null

const NON_WORD = /[^a-z0-9]+/g

/** The page's address segment, from the player's name of the technique. */
export const techniqueSlug = (technique: Technique): string =>
  techniqueName(technique).toLowerCase().replaceAll(NON_WORD, '-')

export interface TechniquePage {
  readonly slug: string
  readonly name: string
  /** The level the solver grades it at, or null for the search. */
  readonly level: Level | null
  readonly meta: PageMeta
  readonly paragraphs: readonly string[]
  readonly example: Example
  /** Opens the example's puzzle in the app. */
  readonly playHref: string
  readonly previous: PageLink | null
  readonly next: PageLink | null
}

const linkTo = (technique: Technique | undefined): PageLink | null =>
  technique === undefined
    ? null
    : { href: techniquePath(techniqueSlug(technique)), label: techniqueName(technique) }

/** A link that opens a puzzle in the app, as a shared puzzle link does. */
export const playLink = (puzzle: string): string => `${APP_PATH}?p=${puzzle}`

function exampleOf(corpus: readonly CorpusPuzzle[], technique: Technique): Example {
  const example =
    technique === 'Backtracking' ? stuckExample(corpus) : techniqueExample(corpus, technique)
  if (example === null) throw new Error(`the corpus holds no example of ${technique}`)
  return example
}

export function techniquePage(
  technique: Technique,
  corpus: readonly CorpusPuzzle[] = CORPUS,
): TechniquePage {
  const name = techniqueName(technique)
  const slug = techniqueSlug(technique)
  const { summary, paragraphs } = GUIDES[technique]
  const at = PAGE_ORDER.indexOf(technique)
  const head = {
    title: `${name} Sudoku technique - ${SITE_NAME}`,
    description: summary,
    path: techniquePath(slug),
  }
  const example = exampleOf(corpus, technique)
  return {
    slug,
    name,
    level: levelOf(technique),
    meta: { ...head, type: 'article', jsonLd: articleLd('Article', head, `${name} (Sudoku)`) },
    paragraphs: [summary, ...paragraphs],
    example,
    playHref: playLink(example.puzzle),
    previous: linkTo(PAGE_ORDER[at - 1]),
    next: linkTo(PAGE_ORDER[at + 1]),
  }
}

/** One static page per technique the solver emits, for the page's getStaticPaths. */
export const techniquePaths = () =>
  PAGE_ORDER.map((technique) => {
    const page = techniquePage(technique)
    return { params: { slug: page.slug }, props: { page } }
  })
