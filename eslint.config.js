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

import { createRequire } from 'node:module'

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import { reactRefresh } from 'eslint-plugin-react-refresh'
import { configs as tseslintConfigs } from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import { flatConfigs as importXConfigs } from 'eslint-plugin-import-x'
import testingLibrary from 'eslint-plugin-testing-library'
import jestDom from 'eslint-plugin-jest-dom'
import promise from 'eslint-plugin-promise'
import unusedImports from 'eslint-plugin-unused-imports'

const reactVersion = createRequire(import.meta.url)('react/package.json').version

const LAYERS = [
  'core',
  'solver',
  'runtime',
  'ui',
  'sw',
  'pages-data',
  'site',
  'components-next',
  'preview',
]
const NUMERIC_LAYERS = ['core', 'solver', 'runtime', 'pages-data']
const SOURCE = '**/*.ts'
// The pure modules Astro renders the first paint with. The ui patches the page with the same output.
const MARKUP_MODULES = [
  'components-next/view.ts',
  'components-next/controls.ts',
  'components-next/icons.ts',
]
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
  // Core imports only itself. Its tests may use vitest, and only compat tests reach the old app.
  {
    files: sourcesOf(['core']),
    ignores: ['src/core/**/*.compat.test.ts'],
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
    ['core', 'wasudoku-wasm'],
    'The solver imports only core types and the wire codec with its types and binding.',
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
      'dist-next',
      'dist-preview',
      '.astro',
      'src/wasudoku-wasm/pkg',
      'coverage',
      'coverage-next',
      'coverage-wasm.xml',
      'playwright-report',
      'playwright-report-next',
      'test-results',
      'test-results-next',
    ],
  },
  // Global, since the react plugin's recommended set also lints this file and warns without it.
  { settings: { react: { version: reactVersion } } },
  js.configs.recommended,
  ...tseslintConfigs.recommended,
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat['jsx-runtime'],
  jsxA11y.flatConfigs.recommended,
  importXConfigs.recommended,
  importXConfigs.typescript,
  promise.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
      },
      'import-x/core-modules': ['wasudoku-wasm'],
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh.plugin,
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react/prop-types': 'off',
      'react/no-unknown-property': ['error', { ignore: ['class'] }],
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
    files: ['**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    plugins: {
      'testing-library': testingLibrary,
      'jest-dom': jestDom,
    },
    rules: {
      ...testingLibrary.configs['flat/react'].rules,
      ...jestDom.configs['flat/recommended'].rules,
      'testing-library/no-node-access': 'off',
    },
  },
]
