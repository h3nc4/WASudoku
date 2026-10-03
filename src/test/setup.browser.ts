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

import { vi } from 'vitest'

// Chromium serves modules unmocked for a moment after a file's first mock route, vitest-dev/vitest#8339.
// Waiting until this probe comes back mocked keeps each test file's own mocks out of that window.
vi.mock('./interception-probe', () => ({ intercepted: true }))

const probe = new URL('./interception-probe.ts', import.meta.url)
const deadline = Date.now() + 5000
let armed = false
while (!armed && Date.now() < deadline) {
  probe.searchParams.set('t', String(Date.now()))
  const mod = (await import(/* @vite-ignore */ probe.href)) as { intercepted: boolean }
  armed = mod.intercepted
  if (!armed) await new Promise((resolve) => setTimeout(resolve, 10))
}
if (!armed) {
  throw new Error('Request interception did not come up within 5s, so module mocks would not apply')
}
