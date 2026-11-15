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

import { chromium } from 'playwright'

import { NOT_DETERMINISTIC } from './determinism.ts'
import { loadKeys } from './keymap.ts'
import { checkKeys } from './keys.ts'
import { checkCrossLoad } from './persistence.ts'
import { checkPwa } from './pwa.ts'
import { note, summary } from './report.ts'
import { startSite } from './serve.ts'
import { checkStates } from './states.ts'

const list = (value: string | undefined) => (value ? value.split(',').filter(Boolean) : [])

const ref = await startSite('ref', process.env.PARITY_REF ?? 'dist')
const candidate = await startSite('candidate', process.env.PARITY_CANDIDATE ?? 'dist')
const only = list(process.env.PARITY_ONLY)
const scenarios = list(process.env.PARITY_SCENARIOS)
const wants = (check: string) => only.length === 0 || only.includes(check)

const browser = await chromium.launch()
const sites = { ref, candidate }
if (wants('states') || wants('pixels') || wants('a11y')) {
  await checkStates(browser, sites, { pixels: wants('pixels'), a11y: wants('a11y') }, scenarios)
}
if (wants('keys')) {
  const source = await loadKeys(process.env.PARITY_SOURCE ?? process.cwd())
  await checkKeys(browser, sites, source)
}
if (wants('persistence')) await checkCrossLoad(browser, sites)
if (wants('pwa')) await checkPwa(browser, sites)
for (const generated of NOT_DETERMINISTIC) note('not deterministic yet', generated)
await browser.close()
await ref.close()
await candidate.close()
process.exit(summary() > 0 ? 1 : 0)
