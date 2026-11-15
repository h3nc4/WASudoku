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

// Through Astro's Vite config, so tests render .astro files with the container API. vitest.config.ts covers it.
// Astro bundles its own vite, which vitest's test key does not augment. The plugins key lets the type check pass.
const config = {
  plugins: [],
  test: {
    name: 'astro',
    // Under jsdom Vite compiles .astro for the client, and rendering then fails.
    environment: 'node',
    include: [
      'src/components/**/*.test.ts',
      'src/preview/**/*.test.ts',
      'src/pages-data/**/*.test.ts',
    ],
  },
}

export default getViteConfig(config)
