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

/// <reference types="node" />

// Builds the Astro page once before the browser tests, which mount it with its inlined CSS.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { TestProject } from 'vitest/node'

const OUT_DIR = resolve('node_modules/.tmp/ui-browser-page')

export default function setup(project: TestProject) {
  const astro = resolve('node_modules/astro/bin/astro.mjs')
  execFileSync(process.execPath, [astro, 'build', '--outDir', OUT_DIR, '--silent'], {
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', PREVIEW: '' },
    stdio: 'inherit',
  })
  project.provide('builtPage', readFileSync(resolve(OUT_DIR, 'index.html'), 'utf8'))
}
