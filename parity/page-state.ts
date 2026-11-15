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
  add(
    'theme',
    [...document.documentElement.classList].sort((a, b) => a.localeCompare(b)),
  )

  const cells = [...document.querySelectorAll('[aria-label^="Sudoku cell at row"]')]
  const valueOf = (el: Element) =>
    el instanceof HTMLInputElement ? el.value : clean(el.textContent)
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

  const active = document.activeElement
  add(
    'focus',
    active && active !== document.body
      ? clean(active.getAttribute('aria-label') ?? active.textContent).slice(0, 80)
      : null,
  )

  const controls = document.querySelectorAll(
    'button, [role="button"], [role="radio"], [role="menuitem"], [role="switch"]',
  )
  for (const el of controls) {
    if (!isShown(el)) continue
    const name = clean(el.getAttribute('aria-label') ?? el.textContent)
    const disabled =
      (el instanceof HTMLButtonElement && el.disabled) ||
      el.getAttribute('aria-disabled') === 'true'
    const state = ['aria-pressed', 'aria-checked', 'aria-expanded']
      .map((attr) => el.getAttribute(attr))
      .map((value) => value ?? '-')
      .join(' ')
    add(`control ${name}`, `${disabled ? 'disabled' : 'enabled'} ${state}`)
  }

  for (const el of document.querySelectorAll('h1, h2, h3, [role="heading"]')) {
    if (isShown(el)) add('heading', clean(el.textContent))
  }
  for (const el of document.querySelectorAll('[role="dialog"], [role="alertdialog"]')) {
    add('dialog', unorigin(clean(el.textContent)))
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

/** Every localStorage entry, sorted by key, exactly as stored. */
export function readStorage(): string {
  return Object.keys(localStorage)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key} = ${localStorage.getItem(key) ?? ''}`)
    .join('\n')
}
