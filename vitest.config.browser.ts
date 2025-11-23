/*
 * Copyright (C) 2025  Henrique Almeida
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
import { mergeConfig, defineConfig } from 'vitest/config'
import viteConfig from './vite.config'
import { playwright } from '@vitest/browser-playwright'
import { devices } from '@playwright/test'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      browser: {
        enabled: true,
        provider: playwright({}),
        headless: true,
        instances: [
          {
            name: 'chromium',
            browser: 'chromium',
          },
          {
            name: 'firefox',
            browser: 'firefox',
          },
          {
            name: 'webkit',
            browser: 'webkit',
          },
          {
            name: 'mobile-chrome',
            browser: 'chromium',
            viewport: {
              width: devices['Pixel 5'].viewport.width,
              height: devices['Pixel 5'].viewport.height,
            },
          },
          {
            name: 'mobile-safari',
            browser: 'webkit',
            viewport: {
              width: devices['iPhone 12'].viewport.width,
              height: devices['iPhone 12'].viewport.height,
            },
          },
          {
            name: 'pixel-7',
            browser: 'chromium',
            viewport: {
              width: devices['Pixel 7'].viewport.width,
              height: devices['Pixel 7'].viewport.height,
            },
          },
          {
            name: 'iphone-15',
            browser: 'webkit',
            viewport: {
              width: devices['iPhone 15'].viewport.width,
              height: devices['iPhone 15'].viewport.height,
            },
          },
          {
            name: 'ipad-pro',
            browser: 'webkit',
            viewport: {
              width: devices['iPad Pro 11'].viewport.width,
              height: devices['iPad Pro 11'].viewport.height,
            },
          },
          {
            name: 'google-chrome',
            browser: 'chromium',
            provider: playwright({
              launchOptions: { channel: 'chrome' },
            }),
          },
          {
            name: 'msedge',
            browser: 'chromium',
            provider: playwright({
              launchOptions: { channel: 'msedge' },
            }),
          },
        ],
      },
    },
  }),
)
