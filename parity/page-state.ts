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

// Runs in the page, so it reads only through the contract the rewrite keeps: accessible names,
// roles, visible text and the documented data-testid names. It may use nothing from module scope.
export function readPageState(): string {
  const lines: string[] = []
  const add = (label: string, value: unknown) => lines.push(`${label}: ${JSON.stringify(value)}`)
  const clean = (text: string | null | undefined) => (text ?? '').replaceAll(/\s+/g, ' ').trim()
  const origin = location.origin
  const unorigin = (text: string) => text.replaceAll(origin, '<origin>')
  const isShown = (el: Element) => el.getClientRects().length > 0 && !el.closest('[inert]')

  add('url', location.pathname + location.search + location.hash)
  // The reference sets the theme as a class on the root, the candidate as data-theme.
  const root = document.documentElement
  const themes = new Set([...root.classList, root.dataset['theme'] ?? ''])
  add(
    'theme',
    ['dark', 'light'].filter((theme) => themes.has(theme)),
  )

  // Reference cells are named inputs, candidate cells are gridcells with a drawn digit.
  const cells = [
    ...document.querySelectorAll('[aria-label^="Sudoku cell at row"], [role="gridcell"]'),
  ]
  const valueOf = (el: Element) =>
    el instanceof HTMLInputElement
      ? el.value
      : clean(el.querySelector('[data-testid="cell-digit"]')?.textContent)
  add('board', cells.map((el) => valueOf(el) || '.').join(''))
  add(
    'invalid',
    cells.flatMap((el, i) => (el.getAttribute('aria-invalid') === 'true' ? [i] : [])),
  )
  const faces = [...document.querySelectorAll('[data-testid="cell-background"]')]
  add(
    'faces',
    faces.map((el) => clean(el.textContent)),
  )
  add(
    'error marks',
    faces.flatMap((el, i) => (el.querySelector('[data-testid="cell-error-mark"]') ? [i] : [])),
  )
  const grid = document.querySelector('[role="grid"]')
  add('grid', grid ? { hidden: grid.getAttribute('aria-hidden'), shown: isShown(grid) } : null)

  // A focused cell reads as R1C3 on both builds, whatever the rest of its name says.
  const cellName = (name: string) =>
    name.replace(/^Sudoku cell at row (\d), column (\d)$/, 'R$1C$2').replace(/^(R\dC\d),.*$/, '$1')
  const active = document.activeElement
  add(
    'focus',
    active && active !== document.body
      ? cellName(clean(active.getAttribute('aria-label') ?? active.textContent)).slice(0, 80)
      : null,
  )

  // The candidate's input modes are native radios, named and shown by their label.
  const controls = document.querySelectorAll(
    'button, [role="button"], [role="radio"], input[type="radio"], [role="menuitem"], [role="switch"]',
  )
  for (const el of controls) {
    const native = el instanceof HTMLInputElement ? el : null
    const label = native?.labels?.[0]
    if (!isShown(label ?? el)) continue
    const name = clean(el.getAttribute('aria-label') ?? (label ?? el).textContent)
    const disabled = el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true'
    const checked = native ? String(native.checked) : el.getAttribute('aria-checked')
    const state = [el.getAttribute('aria-pressed'), checked, el.getAttribute('aria-expanded')]
      .map((value) => value ?? '-')
      .join(' ')
    add(`control ${name}`, `${disabled ? 'disabled' : 'enabled'} ${state}`)
  }

  for (const el of document.querySelectorAll('h1, h2, h3, [role="heading"]')) {
    if (isShown(el)) add('heading', clean(el.textContent))
  }
  // The candidate keeps its native dialogs in the page while closed, so only a shown one counts.
  for (const el of document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog')) {
    if (isShown(el)) add('dialog', unorigin(clean(el.textContent)))
  }
  for (const el of document.querySelectorAll(
    '[role="status"], [role="alert"], [data-sonner-toast]',
  )) {
    const text = clean(el.textContent)
    if (text && isShown(el)) add('status', unorigin(text))
  }

  // Timer, mistakes, step counter and the game label, found by their text alone.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const counters = /^(\d{2}:\d{2}|\d+\/\d+|Easy|Medium|Hard|Expert|Extreme|Custom|Solved|Paused)$/
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = clean(node.textContent)
    const parent = node.parentElement
    if (counters.test(text) && parent && isShown(parent)) add('text', text)
  }

  const copied: unknown = Reflect.get(globalThis, '__parityClipboard')
  add('clipboard', Array.isArray(copied) ? copied.map((t) => unorigin(String(t))) : [])
  return lines.join('\n')
}

/** Whether any cell holds a digit, read in the page from either build's cells. */
export function boardHasDigits(): boolean {
  return [
    ...document.querySelectorAll('[aria-label^="Sudoku cell at row"], [role="gridcell"]'),
  ].some((el) =>
    el instanceof HTMLInputElement
      ? el.value !== ''
      : (el.querySelector('[data-testid="cell-digit"]')?.textContent ?? '').trim() !== '',
  )
}

/** Every localStorage entry, sorted by key, exactly as stored. */
export function readStorage(): string {
  return Object.keys(localStorage)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key} = ${localStorage.getItem(key) ?? ''}`)
    .join('\n')
}
