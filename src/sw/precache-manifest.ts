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

/** What the build writes into the service worker, with a version that changes on every deploy. */
export interface PrecacheManifest {
  readonly version: string
  /** Paths relative to the worker's scope that hold a hash of their content in the file name. */
  readonly hashed: readonly string[]
  /** The other paths, with `./` standing for the app shell. */
  readonly urls: readonly string[]
  /** The directory every hashed path sits in, so the worker can tell a shell from another deploy. */
  readonly assetsDir: string
}

/** A file the build writes, with its path relative to the output directory. */
export interface EmittedFile {
  readonly name: string
  readonly content: string | Uint8Array
}

/** What the service worker precaches, split by whether a file's name changes with its content. */
export interface PrecacheEntries {
  readonly files: readonly EmittedFile[]
  readonly hashed: readonly string[]
  readonly urls: readonly string[]
}

type CodePointRange = readonly [first: number, last: number]

const HEX = 16
const FONT_FACE = /@font-face\s*\{[^}]*\}/g
const UNICODE_RANGE = /unicode-range\s*:\s*([^;}]+)/i
const SOURCE_URL = /url\(\s*["']?([^"')\s]+)/g
const TEXT_FILE = /\.(?:html|js|css)$/
// A page may inline its stylesheet, so its @font-face rules sit in the HTML.
const STYLE_FILE = /\.(?:html|css)$/
const SHELL = 'index.html'

/** Parses a CSS unicode-range such as `U+26, U+0-7F, U+4??` into inclusive ranges. */
export function parseUnicodeRange(value: string): CodePointRange[] {
  return value.split(',').map((part) => {
    const bounds = part.trim().replace(/^U\+/i, '')
    const dash = bounds.indexOf('-')
    const first = dash < 0 ? bounds : bounds.slice(0, dash)
    const last = dash < 0 ? bounds : bounds.slice(dash + 1)
    return [
      Number.parseInt(first.replaceAll('?', '0'), HEX),
      Number.parseInt(last.replaceAll('?', 'F'), HEX),
    ]
  })
}

const decoder = new TextDecoder()
const textOf = (file: EmittedFile) =>
  typeof file.content === 'string' ? file.content : decoder.decode(file.content)

/** Every character the files spell out literally, a superset of the text the UI can show. */
export function codePointsOf(files: readonly EmittedFile[]): Set<number> {
  const codePoints = new Set<number>()
  for (const file of files) {
    for (const char of textOf(file)) codePoints.add(Number(char.codePointAt(0)))
  }
  return codePoints
}

/** Font files whose every `@font-face` declares a unicode-range none of the code points fall in. */
export function unusedFonts(
  styles: readonly EmittedFile[],
  codePoints: ReadonlySet<number>,
): Set<string> {
  const used = new Set<string>()
  const judged = new Set<string>()
  for (const style of styles) {
    for (const [face] of textOf(style).matchAll(FONT_FACE)) {
      const range = UNICODE_RANGE.exec(face)?.[1]
      const isUsed =
        range === undefined ||
        parseUnicodeRange(range).some(([first, last]) =>
          [...codePoints].some((codePoint) => codePoint >= first && codePoint <= last),
        )
      const files = isUsed ? used : judged
      for (const [, url = ''] of face.matchAll(SOURCE_URL)) {
        // Resolved against the stylesheet, which maps a relative and a root-relative URL to one file.
        const name = new URL(url, `file:///${style.name}`).pathname.slice(1)
        files.add(name)
      }
    }
  }
  return new Set([...judged].filter((name) => !used.has(name)))
}

/** Picks what the app can use out of the emitted files, keeping their order. */
export function precacheEntries(files: readonly EmittedFile[], assetsDir: string): PrecacheEntries {
  const unused = unusedFonts(
    files.filter((file) => STYLE_FILE.test(file.name)),
    codePointsOf(files.filter((file) => TEXT_FILE.test(file.name))),
  )
  const kept = files.filter((file) => !unused.has(file.name))
  const isHashed = (file: EmittedFile) => file.name.startsWith(`${assetsDir}/`)
  return {
    files: kept,
    hashed: kept.filter(isHashed).map((file) => file.name),
    // Some hosts redirect /index.html to /, and a redirect cannot answer a navigation.
    urls: kept
      .filter((file) => !isHashed(file))
      .map((file) => (file.name === SHELL ? './' : file.name)),
  }
}
