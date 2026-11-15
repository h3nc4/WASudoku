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

import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { THEME_KEY } from '../../src/ui/theme'
import { serveSite, type StaticSite } from './server'

const BUILD = 'dist-next'
const PAGES = 21
const NARROW = { width: 320, height: 640 }
const WIDE = { width: 1280, height: 900 }
// The default axe run leaves target-size off, WCAG 2.2 AA 2.5.8 needs it on.
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

let server: StaticSite

test.beforeAll(async () => {
  server = await serveSite(BUILD)
})

test.afterAll(async () => {
  await server.close()
})

test('every page the app links to loads, and so does every link on it', async ({ page }) => {
  const seen = new Set<string>()
  const queue = ['/']
  while (queue.length > 0) {
    const pathname = queue.shift() ?? '/'
    if (seen.has(pathname)) continue
    seen.add(pathname)
    const response = await page.goto(`${server.url}${pathname}`)
    expect(response?.status(), pathname).toBe(200)
    const hrefs = await page
      .locator('a[href]')
      .evaluateAll((links) =>
        links.map((link) => (link instanceof HTMLAnchorElement ? link.href : '')),
      )
    for (const href of hrefs) {
      const url = new URL(href)
      if (url.origin === server.url) queue.push(url.pathname)
    }
  }
  expect(seen.size).toBe(PAGES)
})

test.describe('the content pages', () => {
  const themes = ['light', 'dark'] as const
  const paths = ['/', '/solver/', '/techniques/x-wing/', '/techniques/backtracking/']
  for (const [pathname, theme] of paths.flatMap((p) => themes.map((t) => [p, t] as const))) {
    test(`${pathname} in ${theme} has no axe violation and fits 320 px`, async ({ page }) => {
      await page.addInitScript(
        ([key, value]) => {
          localStorage.setItem(key, value)
        },
        [THEME_KEY, theme] as const,
      )
      await page.setViewportSize(NARROW)
      await page.goto(`${server.url}${pathname}`)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      const { violations } = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
      expect(
        violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) })),
      ).toEqual([])
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBe(0)
    })
  }
})

for (const pathname of ['/', '/solver/']) {
  test(`${pathname} has no target under 24 px at 1280 px`, async ({ page }) => {
    await page.setViewportSize(WIDE)
    await page.goto(`${server.url}${pathname}`)
    const { violations } = await new AxeBuilder({ page }).withRules(['target-size']).analyze()
    expect(violations.map(({ nodes }) => nodes.map((n) => n.target))).toEqual([])
  })
}
