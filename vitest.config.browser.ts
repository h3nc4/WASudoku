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
import { AxeBuilder } from '@axe-core/playwright'
import { devices } from '@playwright/test'
import { playwright } from '@vitest/browser-playwright'
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import type { BrowserCommand } from 'vitest/node'

import viteConfig from './vite.config'

type BrowserType = 'chromium' | 'firefox' | 'webkit'

const basicBrowsers: Array<{ name: string; browser: BrowserType }> = [
  { name: 'chromium', browser: 'chromium' },
  { name: 'firefox', browser: 'firefox' },
  { name: 'webkit', browser: 'webkit' },
]

const iphone15 = devices['iPhone 15'].viewport

const phoneBrowsers = [
  {
    name: 'iphone-15',
    browser: 'webkit' as const,
    viewport: { width: iphone15.width, height: iphone15.height },
  },
]

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
const FRAME_MARK = 'data-axe-frame'

// Runs @axe-core/playwright over the calling test's own iframe, as `rule impact target` lines.
// Rules that judge a whole page skip a frame, so landmarks and the h1 rest on render.test.ts.
const axe: BrowserCommand<[]> = async ({ page, frame }) => {
  const element = await (await frame()).frameElement()
  await element.evaluate((node, mark) => {
    if (node instanceof Element) node.setAttribute(mark, '')
  }, FRAME_MARK)
  try {
    const { violations } = await new AxeBuilder({ page })
      .include([`iframe[${FRAME_MARK}]`, 'html'])
      .withTags(AXE_TAGS)
      .analyze()
    return violations.flatMap((rule) =>
      rule.nodes.map((node) => `${rule.id} ${rule.impact ?? 'unknown'} ${node.target.join(' > ')}`),
    )
  } finally {
    await element.evaluate((node, mark) => {
      if (node instanceof Element) node.removeAttribute(mark)
    }, FRAME_MARK)
  }
}

const merged = mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // The built page comes from vite.config.ts's global setup, which this merges in.
      browser: {
        enabled: true,
        commands: { axe },
        provider: playwright({}),
        headless: true,
        instances: [...basicBrowsers, ...phoneBrowsers],
      },
    },
  }),
)

// Set after the merge, which would append the jsdom exclusion of the browser tests.
export default {
  ...merged,
  test: {
    ...merged.test,
    // These read files from disk, run ESLint, compare against Node's own parser or render Astro
    // through its container API, none of which a page can do
    exclude: [
      ...configDefaults.exclude,
      'src/components-next/**',
      'src/pages/**',
      'src/layouts/**',
      'src/preview/**',
      'src/site/**',
      'src/**/*.wasm.test.ts',
      'src/core/codec/wire.test.ts',
      'src/core/codec/wire.contract.test.ts',
      'src/core/codec/share.compat.test.ts',
      'src/core/text/techniques.compat.test.ts',
      'scripts/**',
    ],
  },
}
