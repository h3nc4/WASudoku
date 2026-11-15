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

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import type { AstroIntegration } from 'astro'
import { defineConfig } from 'astro/config'
import { build } from 'vite'

import { SITE } from './src/pages-data/site.ts'
import { finishBuild } from './src/site/finish.ts'
import { buildDay } from './src/site/sitemap.ts'

// Underscored pages never route, so only a preview build adds them, into its own directory.
const isPreview = process.env.PREVIEW === '1'

const previewPages: AstroIntegration = {
  name: 'wasudoku:preview-pages',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      injectRoute({
        pattern: '/_preview/[state]',
        entrypoint: './src/pages/_preview/[state].astro',
        prerender: true,
      })
    },
  },
}

const ASSETS_DIR = 'assets'
const SERVICE_WORKER = 'sw.js'
const fromRoot = (file: string) => fileURLToPath(new URL(file, import.meta.url))

/** One classic script, since a worker registered without type: 'module' cannot import. */
async function bundleWorker(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    build: {
      write: false,
      target: 'es2022',
      minify: true,
      lib: {
        entry: fromRoot('./src/sw/sw.ts'),
        formats: ['iife'],
        name: 'sw',
        fileName: () => SERVICE_WORKER,
      },
    },
  })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((out) =>
    'output' in out ? out.output : [],
  )
  const worker = outputs.find((chunk) => chunk.fileName === SERVICE_WORKER)
  if (worker?.type !== 'chunk') throw new Error(`the build wrote no ${SERVICE_WORKER}`)
  return worker.code
}

// Writes the worker, the extended web manifest and the edge headers once the pages exist.
const pwa: AstroIntegration = {
  name: 'wasudoku:pwa',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      await finishBuild({
        outDir: fileURLToPath(dir),
        assetsDir: ASSETS_DIR,
        baseManifest: readFileSync(fromRoot('./public/manifest.json'), 'utf8'),
        screenshotsDir: fromRoot('./src/assets/screenshots'),
        bundleWorker,
        site: SITE,
        lastmod: buildDay(process.env.SOURCE_DATE_EPOCH, new Date()),
      })
    },
  },
}

export default defineConfig({
  srcDir: './src',
  publicDir: './public',
  outDir: isPreview ? './dist-preview' : './dist',
  output: 'static',
  devToolbar: { enabled: false },
  integrations: isPreview ? [previewPages] : [pwa],
  build: { assets: ASSETS_DIR, inlineStylesheets: 'always' },
  vite: {
    plugins: [tailwindcss()],
    build: {
      target: 'es2022',
      modulePreload: { polyfill: false },
      // The casual digits load only once a pencil digit shows, so inlining them would delay every first paint.
      assetsInlineLimit: (file: string) => (file.endsWith('.woff2') ? false : undefined),
    },
  },
})
