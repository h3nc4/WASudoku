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
import { copyFileSync, readFileSync } from 'fs'
import path from 'path'
import type { Plugin } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

import { PRECACHED_PUBLIC_FILES, precacheManifest as manifestOf } from './src/site/precache.ts'

const SERVICE_WORKER = 'sw.js'
const NOT_FOUND_PAGE = '404.html'

// The Astro UI compiles through Astro's own Vite config, so vitest.config.next.ts tests and covers it.
const ASTRO_SOURCES = [
  'src/pages/**',
  'src/layouts/**',
  'src/components-next/**',
  'src/preview/**',
  'src/pages-data/**',
]

/** Writes what the app can use into sw.js, with a version that changes whenever any of it does. */
function precacheManifest(): Plugin {
  let publicDir = ''
  let assetsDir = ''
  return {
    name: 'wasudoku:precache-manifest',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir
      assetsDir = config.build.assetsDir
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
        const manifest = JSON.stringify(manifestOf(files, assetsDir))
        worker.code = worker.code.replaceAll('__PRECACHE_MANIFEST__', manifest)
      },
    },
  }
}

/** Copies the 404 page outside the bundle. Astro skips its own 404 page while public/ holds one. */
function notFoundPage(): Plugin {
  let outDir = ''
  return {
    name: 'wasudoku:not-found-page',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    writeBundle() {
      copyFileSync(path.resolve(__dirname, NOT_FOUND_PAGE), path.join(outDir, NOT_FOUND_PAGE))
    },
  }
}

const HEADERS_FILE = '_headers'
const CACHE_CONTROL = /^\s+Cache-Control:\s*(.+)$/i

/** The Cache-Control of each path in public/_headers, in the order the edge reads them. */
function readCachePolicy(publicDir: string) {
  const rules: { readonly pattern: string; readonly value: string }[] = []
  let pattern = ''
  for (const line of readFileSync(path.join(publicDir, HEADERS_FILE), 'utf8').split('\n')) {
    if (line.startsWith('/')) pattern = line.trim()
    const value = CACHE_CONTROL.exec(line)?.[1]
    if (value) rules.push({ pattern, value: value.trim() })
  }
  return rules
}

/** A trailing `*` in a _headers path is a splat that matches any rest of the path. */
const matchesPath = (pattern: string, pathname: string) =>
  pattern.endsWith('*') ? pathname.startsWith(pattern.slice(0, -1)) : pathname === pattern

/** Caches a preview as production does, because a worker refetches what the HTTP cache lacks. */
function previewCachePolicy(): Plugin {
  return {
    name: 'wasudoku:preview-cache-policy',
    // The edge never varies on Origin, which would split a crossorigin script from the worker's copy.
    config: () => ({ preview: { cors: false } }),
    configurePreviewServer(server) {
      const rules = readCachePolicy(server.config.publicDir)
      server.middlewares.use((req, res, next) => {
        const { pathname } = new URL(req.url ?? '/', 'http://preview')
        const rule = rules.find((candidate) => matchesPath(candidate.pattern, pathname))
        // The static handler keeps a header already set, so this replaces its no-cache.
        if (rule) res.setHeader('Cache-Control', rule.value)
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss(), precacheManifest(), notFoundPage(), previewCachePolicy()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'wasudoku-wasm': path.resolve(__dirname, './src/wasudoku-wasm/pkg'),
    },
  },
  build: {
    // The casual digits load only once a pencil digit shows, so inlining them would delay every first paint.
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
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
    // Browser tests start real workers, which jsdom lacks, and the Astro sources test under node.
    exclude: [...configDefaults.exclude, 'src/**/*.browser.test.ts', ...ASTRO_SOURCES],
    setupFiles: 'src/test/setup.ts',
    // The ui tests mount the page Astro builds, as the browser tests do.
    globalSetup: ['src/test/built-page.setup.ts'],
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
        'src/sw/sw.ts',
        // Vendored shadcn/ui source, which sonar-project.properties leaves out too, and test helpers.
        'src/components/ui/**',
        'src/wasudoku-wasm/**',
        'src/test/**',
        ...ASTRO_SOURCES,
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/__mocks__/**',
        '**/*.d.ts',
      ],
    },
  },
})
