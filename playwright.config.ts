/*
 * Copyright (C) 2026  Henrique Almeida
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

import { defineConfig, devices } from '@playwright/test'

const isCI = Boolean(process.env.CI)
// Tests that drive the browser over CDP, which only Chromium speaks, such as clearing the HTTP cache.
const CHROMIUM_ONLY = /@chromium-only/

// Each suite serves the build in dist itself, through e2e/server.ts, which applies _headers as the edge does.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  workers: isCI ? 2 : 1,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', grepInvert: CHROMIUM_ONLY, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', grepInvert: CHROMIUM_ONLY, use: { ...devices['Desktop Safari'] } },
    { name: 'iphone-15', grepInvert: CHROMIUM_ONLY, use: { ...devices['iPhone 15'] } },
  ],
})
