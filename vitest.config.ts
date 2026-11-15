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

import { configDefaults, defineConfig, type TestProjectInlineConfiguration } from 'vitest/config'

const ALL = 100

// vitest.astro.config.ts renders these through Astro's own Vite config, under node.
export const ASTRO_SOURCES = [
  'src/pages/**',
  'src/layouts/**',
  'src/components/**',
  'src/preview/**',
  'src/pages-data/**',
]

/** Everything outside the Astro sources, in jsdom, which the browser config also runs in engines. */
export const unit = {
  // Workers load as modules, as the browser tests start them.
  worker: { format: 'es' },
  test: {
    name: 'unit',
    globals: true,
    environment: 'jsdom',
    // Browser tests start real workers, which jsdom lacks.
    exclude: [...configDefaults.exclude, 'src/**/*.browser.test.ts', ...ASTRO_SOURCES],
    setupFiles: 'src/test/setup.ts',
    // The ui tests mount the page Astro builds, as the browser tests do.
    globalSetup: ['src/test/built-page.setup.ts'],
    css: false,
  },
} satisfies TestProjectInlineConfiguration

// Both projects run in one pass, and the threshold applies to their merged coverage.
export default defineConfig({
  test: {
    projects: [unit, './vitest.astro.config.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      reportOnFailure: true,
      thresholds: { lines: ALL, branches: ALL, functions: ALL, statements: ALL },
      // SonarQube indexes no .astro file. The gate counts the .ts modules, which define every branch.
      include: ['src/**/*.ts'],
      exclude: ['src/sw/sw.ts', 'src/wasudoku-wasm/**', 'src/test/**', '**/*.test.ts', '**/*.d.ts'],
    },
  },
})
