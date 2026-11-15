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

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/** Every colour pair a board cell can draw, computed from tokens.css by WCAG 2 relative luminance. */
const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')
const board = readFileSync(new URL('../styles/board.css', import.meta.url), 'utf8')

type Rgba = readonly [number, number, number, number]
type Theme = 'light' | 'dark'

const TEXT = 4.5
const LARGE_TEXT = 3
const MARK = 3

const block = (selector: string, from = 0): string => {
  const start = css.indexOf(`${selector} {`, from)
  expect(start, selector).toBeGreaterThanOrEqual(0)
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
}

const declarations = (body: string): Map<string, string> =>
  new Map([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]))

/** Splits light-dark(a, b) at its top-level comma. */
const split = (value: string): Record<Theme, string> => {
  const inner = /^light-dark\((.*)\)$/.exec(value)?.[1]
  if (inner === undefined) return { light: value, dark: value }
  let depth = 0
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '(') depth++
    else if (inner[i] === ')') depth--
    else if (inner[i] === ',' && depth === 0) {
      return { light: inner.slice(0, i).trim(), dark: inner.slice(i + 1).trim() }
    }
  }
  throw new Error(`no comma in ${value}`)
}

const parse = (value: string): Rgba => {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value)
  if (hex) return [parseInt(hex[1]!, 16), parseInt(hex[2]!, 16), parseInt(hex[3]!, 16), 1]
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(value)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1)]
  throw new Error(`unparsed colour ${value}`)
}

const root = declarations(block(':root'))
const supports = css.indexOf('@supports not')
const fallback: Record<Theme, Map<string, string>> = {
  dark: declarations(block(':root', supports)),
  light: declarations(block(":root[data-theme='light']", supports)),
}

const token = (name: string, theme: Theme): Rgba => {
  const value = root.get(name)
  expect(value, name).toBeDefined()
  return parse(split(value!)[theme])
}

/** Translucent layers composited in order over the board's paper, rounded as the browser draws them. */
const fill = (layers: readonly string[], theme: Theme): Rgba =>
  layers.reduce<Rgba>(
    (under, name) => {
      const [r, g, b, a] = token(name, theme)
      const mix = (c: number, u: number) => Math.round(c * a + u * (1 - a))
      return [mix(r, under[0]), mix(g, under[1]), mix(b, under[2]), 1]
    },
    token('paper', theme),
  )

const luminance = ([r, g, b]: Rgba): number => {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

const contrast = (a: Rgba, b: Rgba): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

// The highlighter paints over a selected target's stripes unless board.css clears them.
const targetStripes =
  /\.c\[aria-selected='true'\]\[data-target\] \{[^}]*background-image: none;/.test(board)
    ? []
    : ['solver-wash']

/** The tokens layered behind each cell state. A target's stripes alternate the solver wash with bare paper. */
const FILLS = {
  plain: [],
  peer: ['peer'],
  same: ['same'],
  selected: ['highlighter'],
  placed: ['solver-wash'],
  target: ['solver-wash'],
  'selected target': [...targetStripes, 'highlighter'],
} as const satisfies Record<string, readonly string[]>

type Fill = keyof typeof FILLS

interface Pair {
  readonly fg: string
  readonly role: string
  readonly on: readonly Fill[]
  readonly min: number
  readonly themes?: readonly Theme[]
}

// Notes never sit on the same-digit fill, which marks only filled cells, and a dark selected wrong cell drops its highlighter.
const PAIRS: readonly Pair[] = [
  { fg: 'ink', role: 'given digit', on: ['plain', 'peer', 'same', 'selected'], min: TEXT },
  { fg: 'pencil', role: 'player digit', on: ['plain', 'peer', 'selected'], min: TEXT },
  { fg: 'pencil', role: 'bold same digit', on: ['same'], min: LARGE_TEXT },
  { fg: 'error', role: 'wrong digit', on: ['plain', 'peer'], min: TEXT },
  { fg: 'error', role: 'wrong digit', on: ['selected'], min: TEXT, themes: ['light'] },
  { fg: 'error', role: 'bold wrong same digit', on: ['same'], min: LARGE_TEXT },
  { fg: 'solver', role: 'placed digit', on: ['placed'], min: TEXT },
  { fg: 'pencil', role: 'player digit', on: ['target', 'selected target'], min: TEXT },
  { fg: 'error', role: 'wrong digit', on: ['target'], min: TEXT },
  { fg: 'error', role: 'wrong digit', on: ['selected target'], min: TEXT, themes: ['light'] },
  {
    fg: 'note',
    role: 'note',
    on: ['plain', 'peer', 'selected', 'target', 'selected target'],
    min: TEXT,
  },
  {
    fg: 'note-struck',
    role: 'struck note',
    on: ['plain', 'peer', 'selected', 'target', 'selected target'],
    min: TEXT,
  },
  {
    fg: 'solver',
    role: 'strike line',
    on: ['plain', 'peer', 'selected', 'target', 'selected target'],
    min: MARK,
  },
  { fg: 'error', role: 'error X', on: ['plain', 'peer', 'same'], min: MARK },
  { fg: 'error', role: 'error X', on: ['selected'], min: MARK, themes: ['light'] },
  { fg: 'ink', role: 'selection ring', on: ['selected'], min: MARK },
  {
    fg: 'solver',
    role: 'cause and target ring',
    on: ['plain', 'peer', 'same', 'selected', 'target', 'selected target'],
    min: MARK,
  },
]

const THEMES: readonly Theme[] = ['light', 'dark']

const cases = PAIRS.flatMap((pair) =>
  (pair.themes ?? THEMES).flatMap((theme) => pair.on.map((on) => ({ ...pair, theme, on }))),
)

describe('board contrast', () => {
  it.each(cases)('$theme $role ($fg) on $on clears $min:1', ({ theme, fg, on, min }) => {
    expect(contrast(token(fg, theme), fill(FILLS[on], theme))).toBeGreaterThanOrEqual(min)
  })

  it.each(THEMES)('the %s fallback for browsers without light-dark() matches', (theme) => {
    for (const [name, value] of root) {
      if (!value.startsWith('light-dark(')) continue
      expect(fallback[theme].get(name), name).toBe(split(value)[theme])
    }
  })
})
