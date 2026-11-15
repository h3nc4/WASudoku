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

import type { Page } from '@playwright/test'

import { cell, expect, savedGame, test } from './fixtures'

// R1C3 answers 4, so typing it makes a player digit, which the casual voice draws.
const R1C3 = 2

/** Counts the page's requests for one font file, named without its hash. */
function countRequests(page: Page, file: string) {
  const counter = { count: 0 }
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith(`/assets/${file}-`)) counter.count += 1
  })
  return counter
}

const faceStatus = (page: Page, family: string) =>
  page.evaluate(
    (name) => [...document.fonts].find((face) => face.family.replaceAll('"', '') === name)?.status,
    family,
  )

/** The URL an @font-face rule loads for a family, resolved against the page. */
const faceSource = (page: Page, family: string) =>
  page.evaluate((name) => {
    const rules = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules])
    const face = rules.find(
      (rule): rule is CSSFontFaceRule =>
        rule instanceof CSSFontFaceRule &&
        rule.style.getPropertyValue('font-family').replaceAll('"', '') === name,
    )
    const url = face?.style.getPropertyValue('src').match(/url\("?([^")]+)"?\)/)?.[1]
    return url && new URL(url, document.baseURI).href
  }, family)

test('main font is preloaded and casual digits wait for a pencil digit', async ({
  page,
  open,
  browserName,
}) => {
  const main = countRequests(page, 'recursive-main')
  const casual = countRequests(page, 'recursive-casual-digits')
  await open({ game: savedGame() })
  await page.evaluate(async () => {
    await document.fonts.ready
  })

  const preload = page.locator('link[rel="preload"][as="font"]')
  await expect(preload).toHaveAttribute('crossorigin', '')
  const href = await preload.evaluate((link: HTMLLinkElement) => link.href)
  expect(await faceSource(page, 'Recursive Variable')).toBe(href)
  expect(await faceStatus(page, 'Recursive Variable')).toBe('loaded')
  // WebKit loads a same-origin font in no-cors mode, so it fetches again unless a cache header lets it reuse the preload.
  if (browserName !== 'webkit') expect(main.count).toBe(1)
  expect(casual.count).toBe(0)

  await cell(page, R1C3).click()
  await page.keyboard.press('4')
  await expect(cell(page, R1C3)).toHaveValue('4')
  await expect.poll(() => faceStatus(page, 'Recursive Casual')).toBe('loaded')
  expect(casual.count).toBe(1)
})
