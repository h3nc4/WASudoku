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
import { flatConfigs as importXConfigs } from 'eslint-plugin-import-x'
import { configs as tseslintConfigs } from 'typescript-eslint'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { layerZones } from '../eslint.config.js'

const MODULES = [
  'core/game/state',
  'core/game/selectors',
  'core/text/messages',
  'core/codec/wire',
  'core/codec/wire.types',
  'core/codec/abi',
  'core/codec/storage',
  'solver/client',
  'runtime/store',
  'ui/grid',
  'sw/precache',
  'lib/legacy',
]

const ZONE_RULES = new Set([
  'import-x/no-restricted-paths',
  '@typescript-eslint/no-restricted-imports',
])

let root = ''
let eslint

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'lint-zones-'))
  for (const module of MODULES) {
    const file = join(root, 'src', `${module}.ts`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, 'export type T = number\nexport const x = 1\n')
  }
  const library = join(root, 'node_modules', 'signals-lib')
  mkdirSync(library, { recursive: true })
  writeFileSync(
    join(library, 'package.json'),
    JSON.stringify({ name: 'signals-lib', main: 'index.js' }),
  )
  writeFileSync(join(library, 'index.js'), 'export const x = 1\n')
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({ include: ['src'] }))
  eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      tseslintConfigs.base,
      importXConfigs.typescript,
      {
        settings: {
          'import-x/resolver': { typescript: { project: join(root, 'tsconfig.json') } },
        },
      },
      ...layerZones(root),
    ],
  })
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/** The zone rules that report on `source` as written in a file of `layer`. */
async function zoneFindings(layer, source) {
  const [result] = await eslint.lintText(`${source}\n`, {
    filePath: join(root, 'src', layer, 'probe.ts'),
  })
  const fatal = result.messages.filter((message) => message.fatal)
  expect(fatal).toEqual([])
  return result.messages.map((message) => message.ruleId).filter((rule) => ZONE_RULES.has(rule))
}

const cases = [
  ['solver', "import { x } from '../runtime/store'", false],
  ['solver', "import { x } from '../lib/legacy'", false],
  ['solver', "import { x } from '../core/game/state'", false],
  ['solver', "import type { T } from '../core/game/state'", true],
  ['solver', "import { x } from '../core/codec/wire'", true],
  ['solver', "import { x } from '../core/codec/wire.types'", true],
  ['solver', "import { x } from '../core/codec/abi'", true],
  ['solver', "import { x } from '../core/codec/storage'", false],
  ['runtime', "import { x } from '../ui/grid'", false],
  ['runtime', "import { x } from '../core/game/state'", true],
  ['runtime', "import { x } from '../solver/client'", true],
  ['ui', "import { x } from '../solver/client'", false],
  ['ui', "import type { T } from '../solver/client'", false],
  ['ui', "import { x } from '../core/codec/storage'", false],
  ['ui', "import { x } from '../runtime/store'", true],
  ['ui', "import { x } from '../core/game/selectors'", true],
  ['ui', "import { x } from '../core/text/messages'", true],
  ['ui', "import { x } from 'signals-lib'", false],
  ['runtime', "import { x } from 'signals-lib'", true],
  ['sw', "import { x } from '../core/game/state'", false],
  ['sw', "import { x } from './precache'", true],
]

describe('layer import zones', () => {
  it.each(cases)('%s: %s allowed is %s', async (layer, source, allowed) => {
    const findings = await zoneFindings(layer, source)
    if (allowed) expect(findings).toEqual([])
    else expect(findings).not.toEqual([])
  })
})
