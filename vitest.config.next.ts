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

/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config'

const ALL = 100

// Through Astro's Vite config, so tests render .astro files with the container API.
// Astro bundles its own vite, which vitest's test key does not augment. The plugins key lets the type check pass.
const config = {
  plugins: [],
  test: {
    // Under jsdom Vite compiles .astro for the client, and rendering then fails.
    environment: 'node',
    include: [
      'src/components-next/**/*.test.ts',
      'src/preview/**/*.test.ts',
      'src/pages-data/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage-next',
      reporter: ['text', 'lcov'],
      reportOnFailure: true,
      // SonarQube indexes no .astro file. The gate counts the .ts modules, which contain every branch.
      include: ['src/components-next/**/*.ts', 'src/preview/**/*.ts', 'src/pages-data/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      thresholds: { lines: ALL, branches: ALL, functions: ALL, statements: ALL },
    },
  },
}

export default getViteConfig(config)
