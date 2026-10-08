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
import { devices } from '@playwright/test'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'

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

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      setupFiles: ['src/test/setup.browser.ts'],
      browser: {
        enabled: true,
        provider: playwright({}),
        headless: true,
        instances: [...basicBrowsers, ...phoneBrowsers],
      },
    },
  }),
)
