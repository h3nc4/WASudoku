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

/// <reference types="vitest" />
/// <reference types="vite/client" />

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import path from 'path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

const SERVICE_WORKER = 'sw.js'

// The rest of public/ is for crawlers and hosts, which never ask the service worker.
const PRECACHED_PUBLIC_FILES = ['manifest.json', 'favicon.svg', 'icon-192.png', 'icon-512.png']

/** Writes every emitted file into sw.js, with a version that changes whenever any of them does. */
function precacheManifest(): Plugin {
  let publicDir = ''
  return {
    name: 'wasudoku:precache-manifest',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir
    },
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        const worker = bundle[SERVICE_WORKER]
        if (worker?.type !== 'chunk' || !worker.code.includes('__PRECACHE_MANIFEST__')) {
          this.error(`${SERVICE_WORKER} has no __PRECACHE_MANIFEST__ to replace`)
        }
        if (worker.imports.length > 0) {
          this.error(`${SERVICE_WORKER} loads as a classic script and cannot import a shared chunk`)
        }
        const files = Object.values(bundle)
          .filter((file) => file.fileName !== SERVICE_WORKER)
          .map((file) => ({
            name: file.fileName,
            content: file.type === 'chunk' ? file.code : file.source,
          }))
          .concat(
            PRECACHED_PUBLIC_FILES.map((name) => ({
              name,
              content: readFileSync(path.join(publicDir, name)),
            })),
          )
          .sort((a, b) => a.name.localeCompare(b.name))
        const hash = createHash('sha256')
        for (const file of files) hash.update(file.name).update(file.content)
        // Some hosts redirect /index.html to /, and a redirect cannot answer a navigation.
        const urls = files.map((file) => (file.name === 'index.html' ? './' : file.name))
        const manifest = JSON.stringify({ version: hash.digest('hex').slice(0, 16), urls })
        worker.code = worker.code.replaceAll('__PRECACHE_MANIFEST__', manifest)
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), precacheManifest()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'wasudoku-wasm': path.resolve(__dirname, './src/wasudoku-wasm/pkg'),
    },
  },
  build: {
    rolldownOptions: {
      input: {
        index: path.resolve(__dirname, 'index.html'),
        sw: path.resolve(__dirname, 'src/workers/sw.ts'),
      },
      output: {
        // The worker's scope is its own directory, so it has to sit at the root under a fixed name.
        entryFileNames: (chunk) =>
          chunk.name === 'sw' ? SERVICE_WORKER : 'assets/[name]-[hash].js',
      },
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: 'src/test/setup.ts',
    css: false,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'lcov'],
      reportOnFailure: true,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/main.tsx',
        'src/workers/sw.ts',
        'src/components/ui',
        'src/wasudoku-wasm',
        'src/test',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/__mocks__',
        '**/*.d.ts',
      ],
    },
  },
})
