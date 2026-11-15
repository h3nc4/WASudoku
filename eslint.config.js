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

import js from '@eslint/js'
import globals from 'globals'
import { configs as tseslintConfigs } from 'typescript-eslint'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import { flatConfigs as importXConfigs } from 'eslint-plugin-import-x'
import testingLibrary from 'eslint-plugin-testing-library'
import jestDom from 'eslint-plugin-jest-dom'
import promise from 'eslint-plugin-promise'
import unusedImports from 'eslint-plugin-unused-imports'

const LAYERS = [
  'core',
  'solver',
  'runtime',
  'ui',
  'sw',
  'pages-data',
  'site',
  'components',
  'preview',
]
const NUMERIC_LAYERS = ['core', 'solver', 'runtime', 'pages-data']
const SOURCE = '**/*.ts'
// The pure modules Astro renders the first paint with. The ui patches the page with the same output.
const MARKUP_MODULES = ['components/view.ts', 'components/controls.ts', 'components/icons.ts']
const TESTS = '**/*.test.ts'
const sourcesOf = (layers) => layers.map((layer) => `src/${layer}/${SOURCE}`)
const testsOf = (layers) => layers.map((layer) => `src/${layer}/${TESTS}`)

/** Lets layer `name` import only from `allowed`, given as paths under src. */
const zone = (root, name, allowed, message) => ({
  files: sourcesOf([name]),
  rules: {
    'import-x/no-restricted-paths': [
      'error',
      {
        basePath: root,
        zones: [
          {
            target: `./src/${name}`,
            from: './src',
            except: [`./${name}`, ...allowed.map((path) => `./${path}`)],
            message,
          },
        ],
      },
    ],
  },
})

/** The import zones of the rewrite's layers, a function of the root so a test can lint a fixture tree. */
export const layerZones = (root) => [
  // Core imports only itself, and its tests may use vitest.
  {
    files: sourcesOf(['core']),
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          basePath: root,
          zones: [
            {
              target: './src/core',
              from: './src',
              except: ['./core'],
              message: 'The core imports nothing outside core.',
            },
          ],
        },
      ],
    },
  },
  {
    files: sourcesOf(['core']),
    ignores: testsOf(['core']),
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          basePath: root,
          zones: [
            {
              target: './src/core',
              from: './src',
              except: ['./core'],
              message: 'The core imports nothing outside core.',
            },
            {
              target: './src/core',
              from: './node_modules',
              message: 'The core imports no package.',
            },
          ],
        },
      ],
    },
  },
  zone(
    root,
    'solver',
    ['core', 'wasudoku-wasm/pkg'],
    'The solver imports only core types, the wire codec with its types and binding, and the built module.',
  ),
  {
    files: sourcesOf(['solver']),
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)core(/(?!codec/(wire|wire\\.types|abi)(\\.ts)?$).*)?$',
              allowTypeImports: true,
              message:
                'The solver imports only core types and the wire codec with its types and binding.',
            },
          ],
        },
      ],
    },
  },
  {
    ...zone(root, 'runtime', ['core', 'solver'], 'The runtime imports only core and solver.'),
    ignores: testsOf(['runtime']),
  },
  // Its tests also share the fakes in src/test.
  {
    ...zone(
      root,
      'runtime',
      ['core', 'solver', 'test'],
      'Runtime tests import only core, solver and test.',
    ),
    files: testsOf(['runtime']),
  },
  // Its tests may also mount the built page through the shared test helpers.
  {
    ...zone(
      root,
      'ui',
      ['runtime', 'core/game/selectors.ts', 'core/text', ...MARKUP_MODULES, 'test'],
      'The ui tests import only what the ui does, plus src/test.',
    ),
    files: testsOf(['ui']),
  },
  // The ui imports signals from runtime/signals. A swap of the library then touches only the runtime.
  {
    files: sourcesOf(['ui']),
    ignores: testsOf(['ui']),
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          basePath: root,
          zones: [
            {
              target: './src/ui',
              from: './src',
              except: [
                './ui',
                './runtime',
                './core/game/selectors.ts',
                './core/text',
                ...MARKUP_MODULES.map((path) => `./${path}`),
              ],
              message:
                'The ui imports only runtime, core/game/selectors, core/text and the markup helpers, never solver.',
            },
            {
              target: './src/ui',
              from: './node_modules',
              message: 'The ui imports no package, and reaches signals through runtime/signals.',
            },
          ],
        },
      ],
    },
  },
  zone(root, 'sw', [], 'The service worker imports nothing outside sw.'),
]

/** The strict rules of the rewrite's layers, a function of the root so a test can lint a fixture tree. */
export const layerStrictness = (root) => [
  ...tseslintConfigs.strictTypeChecked.map((config) => ({ ...config, files: sourcesOf(LAYERS) })),
  {
    files: sourcesOf(LAYERS),
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: root },
    },
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    files: sourcesOf(NUMERIC_LAYERS),
    rules: {
      'no-magic-numbers': 'off',
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [0, 1, -1],
          ignoreArrayIndexes: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
        },
      ],
    },
  },
  {
    files: testsOf(LAYERS),
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },
]

export default [
  {
    ignores: [
      'dist',
      'dist-preview',
      '.astro',
      'src/wasudoku-wasm/pkg',
      'coverage',
      'coverage-wasm.xml',
      'playwright-report',
      'test-results',
    ],
  },
  js.configs.recommended,
  ...tseslintConfigs.recommended,
  importXConfigs.recommended,
  importXConfigs.typescript,
  promise.configs['flat/recommended'],
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'import-x/first': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/no-duplicates': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'promise/always-return': 'off',
      'promise/catch-or-return': 'off',
    },
  },
  ...layerZones(import.meta.dirname),
  ...layerStrictness(import.meta.dirname),
  {
    files: ['**/*.test.ts', 'src/test/**/*.ts'],
    plugins: {
      'testing-library': testingLibrary,
      'jest-dom': jestDom,
    },
    rules: {
      ...testingLibrary.configs['flat/dom'].rules,
      ...jestDom.configs['flat/recommended'].rules,
      'testing-library/no-node-access': 'off',
    },
  },
]
