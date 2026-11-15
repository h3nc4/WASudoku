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

import { describe, expect, it } from 'vitest'

import {
  codePointsOf,
  type EmittedFile,
  parseUnicodeRange,
  precacheEntries,
  unusedFonts,
} from './precache-manifest'

const face = (url: string, range?: string) =>
  `@font-face{font-family:Test;src:url(${url})format("woff2")${range ? `;unicode-range:${range}` : ''}}`

const css = (name: string, ...faces: string[]): EmittedFile => ({ name, content: faces.join('') })

describe('parseUnicodeRange', () => {
  it('reads single points, spans and wildcards', () => {
    expect(parseUnicodeRange('U+26, U+0-7F,u+4??')).toEqual([
      [0x26, 0x26],
      [0x0, 0x7f],
      [0x400, 0x4ff],
    ])
  })
})

describe('codePointsOf', () => {
  it('collects the characters of text and of bytes alike', () => {
    const points = codePointsOf([
      { name: 'a.js', content: 'aé' },
      { name: 'b.html', content: new TextEncoder().encode('\u{1F12F}') },
    ])
    expect([...points]).toEqual([0x61, 0xe9, 0x1f12f])
  })
})

describe('unusedFonts', () => {
  const ascii = new Set(Array.from('Sudoku', (char) => char.codePointAt(0) as number))

  it('drops a face whose range holds none of the text', () => {
    const styles = [
      css(
        'assets/index.css',
        face('/assets/latin.woff2', 'U+??,U+2000-206F'),
        face('/assets/cyrillic.woff2', 'U+460-52F'),
      ),
    ]
    expect(unusedFonts(styles, ascii)).toEqual(new Set(['assets/cyrillic.woff2']))
  })

  it('keeps a face that declares no range, since it covers every character', () => {
    expect(unusedFonts([css('assets/index.css', face('/assets/any.woff2'))], ascii)).toEqual(
      new Set(),
    )
  })

  it('keeps a file that a used face also refers to', () => {
    const styles = [
      css(
        'assets/index.css',
        face('/assets/shared.woff2', 'U+460-52F'),
        face('"/assets/shared.woff2"', 'U+0-7F'),
      ),
    ]
    expect(unusedFonts(styles, ascii)).toEqual(new Set())
  })

  it('resolves a relative URL against its stylesheet', () => {
    const styles = [css('assets/index.css', face("'./cyrillic.woff2'", 'U+460-52F'))]
    expect(unusedFonts(styles, ascii)).toEqual(new Set(['assets/cyrillic.woff2']))
  })
})

describe('precacheEntries', () => {
  const files: EmittedFile[] = [
    { name: 'assets/index-a.js', content: 'render("Welcome")' },
    css(
      'assets/index-b.css',
      face('/assets/latin-c.woff2', 'U+??'),
      face('/assets/vietnamese-d.woff2', 'U+1EA0-1EF9'),
    ),
    { name: 'assets/latin-c.woff2', content: new Uint8Array([1]) },
    { name: 'assets/vietnamese-d.woff2', content: new Uint8Array([2]) },
    { name: 'favicon.svg', content: '<svg/>' },
    { name: 'index.html', content: '<html></html>' },
  ]

  it('splits hashed assets from plain files and names the shell by its directory', () => {
    const entries = precacheEntries(files, 'assets')
    expect(entries.hashed).toEqual([
      'assets/index-a.js',
      'assets/index-b.css',
      'assets/latin-c.woff2',
    ])
    expect(entries.urls).toEqual(['favicon.svg', './'])
  })

  it('leaves out a font no text in the build can reach', () => {
    const entries = precacheEntries(files, 'assets')
    expect(entries.files.map((file) => file.name)).not.toContain('assets/vietnamese-d.woff2')
    expect(entries.files).toHaveLength(files.length - 1)
  })

  it('keeps a font once the text needs one of its characters', () => {
    const withVietnamese = [...files, { name: 'assets/vi-e.js', content: 'Ồ' }]
    expect(precacheEntries(withVietnamese, 'assets').hashed).toContain('assets/vietnamese-d.woff2')
  })

  it('reads the faces of a stylesheet a page inlines', () => {
    const page: EmittedFile = {
      name: 'index.html',
      content: `<style>${face('/assets/latin-c.woff2', 'U+??')}${face('/assets/vietnamese-d.woff2', 'U+1EA0-1EF9')}</style>`,
    }
    const inlined = [...files.filter((file) => !file.name.endsWith('.css')), page]
    expect(precacheEntries(inlined, 'assets').hashed).toEqual([
      'assets/index-a.js',
      'assets/latin-c.woff2',
    ])
  })
})
