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

import tailwindcss from '@tailwindcss/vite'
import type { AstroIntegration } from 'astro'
import { defineConfig } from 'astro/config'

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

// The React app keeps src/components and dist until cutover. The new UI builds to dist-next.
export default defineConfig({
  srcDir: './src',
  publicDir: './public',
  outDir: isPreview ? './dist-preview' : './dist-next',
  output: 'static',
  devToolbar: { enabled: false },
  integrations: isPreview ? [previewPages] : [],
  build: { assets: 'assets', inlineStylesheets: 'always' },
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
