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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  injectManifest,
  precacheCandidates,
  PRECACHED_PUBLIC_FILES,
  precacheManifest,
  readTree,
} from './precache'

const files = [
  { name: 'index.html', content: '<html>Sudoku</html>' },
  { name: 'assets/font.woff2', content: new Uint8Array([1, 2]) },
  { name: 'favicon.svg', content: '<svg/>' },
]

describe('precacheManifest', () => {
  it('splits the files and versions them by name and content in any order', () => {
    const manifest = precacheManifest(files, 'assets')
    expect(manifest.hashed).toEqual(['assets/font.woff2'])
    expect(manifest.urls).toEqual(['favicon.svg', './'])
    expect(manifest.assetsDir).toBe('assets')
    expect(manifest.version).toMatch(/^[0-9a-f]{16}$/)
    expect(precacheManifest([...files].reverse(), 'assets').version).toBe(manifest.version)
  })

  it('moves to a new version when any byte changes', () => {
    const changed = files.map((file) =>
      file.name === 'favicon.svg' ? { ...file, content: '<svg />' } : file,
    )
    expect(precacheManifest(changed, 'assets').version).not.toBe(
      precacheManifest(files, 'assets').version,
    )
  })
})

describe('precacheCandidates', () => {
  it('keeps the shell, the hashed assets and the listed public files', () => {
    const all = [
      ...files,
      { name: 'manifest.json', content: '' },
      { name: '404.html', content: '' },
      { name: 'robots.txt', content: '' },
      { name: 'icon-192.png', content: '' },
      { name: 'screenshots/wide.png', content: '' },
      { name: 'sw.js', content: '' },
    ]
    expect(precacheCandidates(all, 'assets').map(({ name }) => name)).toEqual([
      'index.html',
      'assets/font.woff2',
      'favicon.svg',
      'manifest.json',
    ])
    expect(PRECACHED_PUBLIC_FILES).toEqual(['manifest.json', 'favicon.svg'])
  })
})

describe('injectManifest', () => {
  const manifest = { version: 'v1', hashed: [], urls: ['./'], assetsDir: 'assets' }

  it('replaces every placeholder with the manifest', () => {
    expect(injectManifest('a(__PRECACHE_MANIFEST__)', manifest)).toBe(
      'a({"version":"v1","hashed":[],"urls":["./"],"assetsDir":"assets"})',
    )
  })

  it('refuses a worker the bundler stripped of its placeholder', () => {
    expect(() => injectManifest('a()', manifest)).toThrow('__PRECACHE_MANIFEST__')
  })
})

describe('readTree', () => {
  let dir = ''

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('lists every file below a directory by its slash path, sorted', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'wasudoku-tree-'))
    mkdirSync(path.join(dir, 'assets', 'deep'), { recursive: true })
    writeFileSync(path.join(dir, 'index.html'), 'page')
    writeFileSync(path.join(dir, 'assets', 'deep', 'a.js'), 'code')

    const tree = readTree(dir)

    expect(tree.map(({ name }) => name)).toEqual(['assets/deep/a.js', 'index.html'])
    expect(new TextDecoder().decode(tree[1]?.content)).toBe('page')
  })
})
