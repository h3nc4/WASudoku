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

const mobileBrowsers = [
  { name: 'mobile-chrome', browser: 'chromium' as const, device: 'Pixel 5' },
  { name: 'mobile-safari', browser: 'webkit' as const, device: 'iPhone 12' },
  { name: 'pixel-7', browser: 'chromium' as const, device: 'Pixel 7' },
  { name: 'iphone-15', browser: 'webkit' as const, device: 'iPhone 15' },
  { name: 'ipad-pro', browser: 'webkit' as const, device: 'iPad Pro 11' },
].map(({ name, browser, device }) => ({
  name,
  browser,
  viewport: {
    width: devices[device].viewport.width,
    height: devices[device].viewport.height,
  },
}))

const channelBrowsers = [
  { name: 'google-chrome', channel: 'chrome' },
  { name: 'msedge', channel: 'msedge' },
].map(({ name, channel }) => ({
  name,
  browser: 'chromium' as const,
  provider: playwright({ launchOptions: { channel } }),
}))

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      browser: {
        enabled: true,
        provider: playwright({}),
        headless: true,
        instances: [...basicBrowsers, ...mobileBrowsers, ...channelBrowsers],
      },
    },
  }),
)
