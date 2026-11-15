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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { ESLint } from 'eslint'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { layerStrictness } from '../eslint.config.js'

const PROBE = 'export const probe = (globalThis as unknown as { x?: number }).x!\n'
// A cold TypeScript project service takes over 10 s on a loaded machine, so setup lints the tree once.
const WARM_UP_MS = 120_000
const CAST_RULES = [
  '@typescript-eslint/consistent-type-assertions',
  '@typescript-eslint/no-non-null-assertion',
]

const cases = [
  ['core', 'probe.ts', true],
  ['site', 'probe.ts', true],
  ['components', 'probe.ts', true],
  ['preview', 'probe.ts', true],
  ['site', 'probe.test.ts', false],
  ['components', 'probe.test.ts', false],
  ['lib', 'probe.ts', false],
]

let root = ''
let results = new Map()

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'lint-strictness-'))
  for (const [layer, file] of cases) {
    const path = join(root, 'src', layer, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, PROBE)
  }
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true, types: [] }, include: ['src'] }),
  )
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: layerStrictness(root),
  })
  const files = cases.map(([layer, file]) => join(root, 'src', layer, file))
  results = new Map((await eslint.lintFiles(files)).map((result) => [result.filePath, result]))
}, WARM_UP_MS)

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('layer strictness', () => {
  it.each(cases)('%s/%s forbids casts and non-null is %s', (layer, file, strict) => {
    const result = results.get(join(root, 'src', layer, file))
    expect(result.messages.filter((message) => message.fatal)).toEqual([])
    const rules = new Set(result.messages.map((message) => message.ruleId))
    expect(CAST_RULES.map((rule) => rules.has(rule))).toEqual(CAST_RULES.map(() => strict))
  })
})
