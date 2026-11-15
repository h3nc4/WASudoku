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

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import {
  type EmittedFile,
  precacheEntries,
  type PrecacheManifest,
} from '../sw/precache-manifest.ts'

const VERSION_LENGTH = 16
const PLACEHOLDER = '__PRECACHE_MANIFEST__'
const SHELL = 'index.html'

/** The rest of public/ is for crawlers, hosts and installers, which never ask the service worker. */
export const PRECACHED_PUBLIC_FILES: readonly string[] = ['manifest.json', 'favicon.svg']

/** What the app can use, versioned by a hash of every precached name and byte. */
export function precacheManifest(
  files: readonly EmittedFile[],
  assetsDir: string,
): PrecacheManifest {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name))
  const { files: precached, hashed, urls } = precacheEntries(sorted, assetsDir)
  const hash = createHash('sha256')
  for (const file of precached) hash.update(file.name).update(file.content)
  return { version: hash.digest('hex').slice(0, VERSION_LENGTH), hashed, urls, assetsDir }
}

/** The files of a static build a worker may precache, out of everything in its directory. */
export const precacheCandidates = (
  files: readonly EmittedFile[],
  assetsDir: string,
): EmittedFile[] =>
  files.filter(
    ({ name }) =>
      name === SHELL || name.startsWith(`${assetsDir}/`) || PRECACHED_PUBLIC_FILES.includes(name),
  )

/** Writes the manifest into a built worker, which must still hold its placeholder. */
export function injectManifest(code: string, manifest: PrecacheManifest): string {
  if (!code.includes(PLACEHOLDER)) throw new Error(`the worker has no ${PLACEHOLDER} to replace`)
  return code.replaceAll(PLACEHOLDER, JSON.stringify(manifest))
}

/** A file read back from disk, which always arrives as bytes. */
export interface TreeFile extends EmittedFile {
  readonly content: Uint8Array
}

/** Every file under a directory, named by its path from there with `/` separators. */
export const readTree = (dir: string): TreeFile[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const file = path.join(entry.parentPath, entry.name)
      return {
        name: path.relative(dir, file).split(path.sep).join('/'),
        content: readFileSync(file),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
