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

// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, join, matchesGlob } from 'node:path'

import { readConfigFile, sys } from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const BUILDER = 'wasudoku-builder'

const read = (file) => readFileSync(join(ROOT, file), 'utf8')
const lines = (file) =>
  read(file)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))

/** What the build stage copies from the context, as written after each COPY. */
function copiedSources() {
  const stages = read('docker/Dockerfile').split(/^FROM /m)
  const builder = stages.find((stage) => stage.split('\n')[0].endsWith(` AS ${BUILDER}`))
  return builder
    .split('\n')
    .filter((line) => line.startsWith('COPY ') && !line.includes('--from='))
    .flatMap((line) => line.split(/\s+/).slice(1, -1))
    .map((source) => source.replaceAll('"', '').replace(/\/$/, ''))
}

/** Every path a project in the tsc -b graph reads, by its first segment under the root. */
function typecheckedRoots(file = 'tsconfig.json', seen = new Set()) {
  if (seen.has(file)) return []
  seen.add(file)
  const { config } = readConfigFile(join(ROOT, file), sys.readFile)
  const references = (config.references ?? []).map((reference) =>
    join(dirname(file), reference.path),
  )
  const inputs = [...(config.include ?? []), ...(config.files ?? [])]
  return [
    ...inputs.map((input) => input.split('/')[0]),
    ...references.flatMap((ref) => typecheckedRoots(ref, seen)),
  ]
}

const covers = (patterns, path) =>
  patterns.some((pattern) => matchesGlob(path, pattern.replace(/\/$/, '')))

describe('the runtime image build stage', () => {
  const copied = copiedSources()
  const ignored = lines('.dockerignore')
  const untracked = lines('.gitignore')
  const roots = [...new Set(typecheckedRoots())].filter((path) => !covers(untracked, path))

  it.each(roots)('copies %s, which tsc -b reads before vite build', (path) => {
    expect(covers(copied, path)).toBe(true)
    expect(covers(ignored, path)).toBe(false)
  })
})
