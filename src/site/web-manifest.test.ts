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

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { DIFFICULTIES } from '../core/pool'
import { NEW_PUZZLE_PARAM, pngSize, SCREENSHOTS, webManifest } from './web-manifest'

/** The first 24 bytes of a PNG, which hold its signature and the IHDR width and height. */
function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

describe('pngSize', () => {
  it('reads the width and height a PNG declares', () => {
    expect(pngSize(pngHeader(1080, 1920))).toBe('1080x1920')
  })

  it('reads a PNG that sits inside a larger buffer', () => {
    const padded = new Uint8Array(32)
    padded.set(pngHeader(3, 4), 8)
    expect(pngSize(padded.subarray(8))).toBe('3x4')
  })

  it.each([
    ['a truncated file', pngHeader(1, 1).subarray(0, 20)],
    ['another format', new Uint8Array(24)],
  ])('refuses %s', (_, bytes) => {
    expect(() => pngSize(bytes)).toThrow('not a PNG')
  })
})

describe('webManifest', () => {
  const sizes = new Map([
    ['narrow.png', '1080x1920'],
    ['wide.png', '1920x1200'],
  ])
  const manifest = webManifest({ name: 'WASudoku', start_url: '.' }, sizes)

  it('keeps the base and pins the identity an installed copy already has', () => {
    expect(manifest).toMatchObject({ name: 'WASudoku', id: '/', start_url: '/', scope: '/' })
  })

  it('sends a launch into the window already open', () => {
    expect(manifest.launch_handler).toEqual({ client_mode: ['navigate-existing', 'auto'] })
  })

  it('offers one shortcut per difficulty, as a query the app reads', () => {
    expect(manifest.shortcuts).toEqual(
      DIFFICULTIES.map((difficulty) =>
        expect.objectContaining({ url: `/?${NEW_PUZZLE_PARAM}=${difficulty}` }),
      ),
    )
    expect(manifest.shortcuts).toContainEqual(
      expect.objectContaining({ name: 'New expert puzzle', short_name: 'Expert' }),
    )
  })

  it('lists a narrow and a wide screenshot at their real sizes', () => {
    expect(manifest.screenshots).toEqual([
      expect.objectContaining({ src: '/screenshots/narrow.png', sizes: '1080x1920' }),
      expect.objectContaining({
        src: '/screenshots/wide.png',
        sizes: '1920x1200',
        form_factor: 'wide',
      }),
    ])
    expect(manifest.screenshots).toHaveLength(SCREENSHOTS.length)
    expect(manifest.screenshots).not.toContainEqual(
      expect.objectContaining({ src: '/screenshots/narrow.png', form_factor: expect.anything() }),
    )
  })
})

describe('twa-manifest.json', () => {
  const twa = JSON.parse(readFileSync('twa-manifest.json', 'utf8')) as {
    host: string
    launchHandlerClientMode: string
    shortcuts: { name: string; shortName: string; url: string; chosenIconUrl: string }[]
  }
  const web = webManifest({}, new Map()) as {
    shortcuts: { name: string; short_name: string; url: string; icons: { src: string }[] }[]
  }
  const site = `https://${twa.host}`

  it('carries the first four web shortcuts, the most bubblewrap imports', () => {
    expect(twa.shortcuts).toEqual(
      web.shortcuts.slice(0, 4).map((shortcut) => ({
        name: shortcut.name,
        shortName: shortcut.short_name,
        url: `${site}${shortcut.url}`,
        chosenIconUrl: `${site}${shortcut.icons[0]?.src ?? ''}`,
      })),
    )
  })

  it('launches into the open window as the web app does', () => {
    expect(twa.launchHandlerClientMode).toBe('navigate-existing')
  })
})
