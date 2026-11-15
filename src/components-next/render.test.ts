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

// Renders the pages as the build does and checks what assistive technology gets from the markup.
import '@testing-library/jest-dom/vitest'

import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

import Preview from '../pages/_preview/[state].astro'
import Index from '../pages/index.astro'
import { PREVIEW_STATES, previewPaths } from '../preview/states'

const container = await AstroContainer.create()

const parse = (html: string) => new JSDOM(html).window.document

async function preview(state: string) {
  const entry = previewPaths().find((path) => path.params.state === state)
  if (!entry) throw new Error(`no preview state ${state}`)
  return parse(await container.renderToString(Preview, { props: entry.props }))
}

const cell = (doc: Document, index: number) => doc.getElementById(`cell-${String(index)}`)

describe('the first visit', async () => {
  const doc = parse(await container.renderToString(Index))

  it('is an APG grid with rows and one tab stop', () => {
    const grid = doc.querySelectorAll('[role="grid"]')
    expect(grid).toHaveLength(1)
    expect(grid[0]).toHaveAttribute('aria-label', 'Sudoku board')
    const rows = doc.querySelectorAll('[role="grid"] > [role="row"]')
    expect(rows).toHaveLength(9)
    for (const row of rows)
      expect(row.querySelectorAll(':scope > [role="gridcell"]')).toHaveLength(9)
    const stops = [...doc.querySelectorAll('[role="gridcell"]')].filter(
      (c) => c.getAttribute('tabindex') === '0',
    )
    expect(stops.map((c) => c.id)).toEqual(['cell-0'])
    expect(doc.querySelectorAll('[role="gridcell"][tabindex="-1"]')).toHaveLength(80)
    expect(cell(doc, 0)).toHaveAttribute('aria-label', 'R1C1, empty')
    const faces = [...doc.querySelectorAll('[role="grid"] [data-testid="cell-background"]')]
    expect(faces.map((c) => c.id)).toEqual(
      Array.from({ length: 81 }, (_, i) => `cell-${String(i)}`),
    )
  })

  it('keeps the board inert behind a labelled selection card', () => {
    expect(doc.querySelector('main')).toHaveAttribute('inert')
    const card = doc.querySelector('section[aria-labelledby="welcome-title"]')
    expect(doc.getElementById('welcome-title')?.textContent.trim()).toBe('Welcome to WASudoku')
    expect(card?.querySelectorAll('button')).toHaveLength(6)
  })

  it('opens the dialogs natively, with names and a form that closes them', () => {
    const dialogs = [...doc.querySelectorAll('dialog')]
    expect(dialogs.map((d) => d.id)).toEqual([
      'win-dialog',
      'abandon-dialog',
      'reveal-dialog',
      'pending-dialog',
    ])
    for (const dialog of dialogs) {
      expect(dialog).not.toHaveAttribute('open')
      expect(dialog).toHaveAttribute('closedby', 'any')
      const title = doc.getElementById(dialog.getAttribute('aria-labelledby') ?? '')
      const description = doc.getElementById(dialog.getAttribute('aria-describedby') ?? '')
      expect(dialog.contains(title)).toBe(true)
      expect(dialog.contains(description)).toBe(true)
      expect(dialog.querySelector('form')).toHaveAttribute('method', 'dialog')
      expect(dialog.querySelector('button[value="close"]')?.textContent).toBe('Close')
    }
    expect(
      dialogs.filter((d) => d.getAttribute('role') === 'alertdialog').map((d) => d.id),
    ).toEqual(['abandon-dialog', 'reveal-dialog', 'pending-dialog'])
    const [cancel] = doc.querySelectorAll('#abandon-dialog button[type="submit"]')
    expect(cancel?.textContent.trim()).toBe('Cancel')
  })

  it('opens each menu from its button as an anchored popover', () => {
    for (const [button, menu] of [
      ['share-button', 'share-menu'],
      ['new-button', 'new-menu'],
    ] as const) {
      const trigger = doc.getElementById(button)
      const popup = doc.getElementById(menu)
      expect(trigger).toHaveAttribute('popovertarget', menu)
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(popup).toHaveAttribute('popover', 'auto')
      expect(popup).toHaveAttribute('role', 'menu')
      expect(popup).toHaveAttribute('aria-labelledby', button)
      const items = popup?.querySelectorAll('[role="menuitem"]') ?? []
      expect(items.length).toBeGreaterThan(0)
      for (const item of items) expect(item).toHaveAttribute('tabindex', '-1')
    }
    // The custom entry is there for script to show, hidden and disabled on the selection screen.
    expect(doc.querySelectorAll('#new-menu [role="menuitem"]:not([hidden])')).toHaveLength(5)
    expect(doc.querySelector('#new-menu [data-action="custom"]')).toBeDisabled()
  })

  it('offers the input mode as one native radio group', () => {
    const group = doc.querySelector('fieldset#input-mode')
    expect(group?.querySelector('legend')?.textContent).toBe('Input mode')
    const radios = [...(group?.querySelectorAll('input[type="radio"]') ?? [])]
    expect(radios.map((r) => r.getAttribute('value'))).toEqual(['normal', 'candidate', 'center'])
    expect(radios.filter((r) => r.hasAttribute('checked'))).toHaveLength(1)
    expect(new Set(radios.map((r) => r.getAttribute('name'))).size).toBe(1)
  })

  it('names the pad as a group of labelled keys', () => {
    const pad = doc.querySelector('[role="group"][aria-label="On-screen number pad"]')
    const keys = pad?.querySelectorAll('button') ?? []
    expect(keys).toHaveLength(9)
    expect(keys[0]).toHaveAttribute('aria-label', 'Enter number 1, 9 left')
  })

  it('renders the parts of every mode for script to show, the absent ones hidden', () => {
    for (const id of [
      'game-status',
      'steps-panel',
      'scroll-hint',
      'hint-button',
      'exit-button',
      'start-button',
    ]) {
      expect(doc.getElementById(id), id).toHaveAttribute('hidden')
    }
    expect(doc.getElementById('selection-screen')).not.toHaveAttribute('hidden')
    expect(doc.querySelector('#steps-panel section')).not.toHaveAttribute('style')
    expect(doc.getElementById('hint-slot')).toHaveAttribute('aria-hidden', 'true')
    expect(doc.querySelector('[role="status"]')?.id).toBe('announcer')
    expect(doc.querySelector('script[type="module"]')).not.toBeNull()
  })

  it('keeps a polite toast region in a manual popover', () => {
    const toasts = doc.getElementById('toasts')
    expect(toasts).toHaveAttribute('popover', 'manual')
    expect(toasts).toHaveAttribute('aria-live', 'polite')
    expect(toasts).toHaveAttribute('aria-label', 'Notifications')
  })

  it('draws every icon from the inline sprite', () => {
    const symbols = new Set([...doc.querySelectorAll('svg.sprite symbol')].map((s) => s.id))
    expect(symbols.size).toBe(28)
    const uses = [...doc.querySelectorAll('use')].map((u) => u.getAttribute('href')?.slice(1))
    expect(uses.length).toBeGreaterThan(0)
    for (const id of uses) expect(symbols.has(id ?? '')).toBe(true)
    for (const icon of doc.querySelectorAll('svg.icon')) {
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    }
  })
})

describe('preview states', () => {
  it('renders every state', async () => {
    for (const state of Object.keys(PREVIEW_STATES)) {
      const doc = await preview(state)
      expect(doc.querySelectorAll('[role="gridcell"]')).toHaveLength(81)
      expect(doc.querySelectorAll('[role="gridcell"][tabindex="0"]')).toHaveLength(1)
    }
  })

  it('announces notes differently from digits and hides their glyphs', async () => {
    const doc = await preview('notes')
    expect(cell(doc, 0)).toHaveAttribute('aria-label', 'R1C1, 5, given')
    expect(cell(doc, 0)).toHaveAttribute('aria-readonly', 'true')
    expect(cell(doc, 6)).toHaveAttribute('aria-label', 'R1C7, empty, candidates 1, 8, 9')
    expect(cell(doc, 33)).toHaveAttribute('aria-label', 'R4C7, empty, center notes 4, 5, 9')
    expect(cell(doc, 56)?.querySelector('.n')?.getAttribute('data-center')).toBe('many')
    for (const glyphs of doc.querySelectorAll('.c > .n, .c > .d')) {
      expect(glyphs).toHaveAttribute('aria-hidden', 'true')
    }
    const selected = doc.querySelector('[aria-selected="true"]')
    expect(selected?.id).toBe('cell-15')
    expect(selected).toHaveAttribute('tabindex', '0')
    expect(doc.querySelector('#input-mode input[value="candidate"]')).toBeChecked()
  })

  it('marks a wrong digit by name, state and shape', async () => {
    const doc = await preview('conflict')
    const wrong = [...doc.querySelectorAll('[aria-invalid="true"]')]
    expect(wrong.map((c) => c.getAttribute('aria-label'))).toEqual([
      'R3C4, 4, wrong',
      'R8C4, 4, given, wrong',
    ])
    for (const c of wrong) expect(c.querySelector('svg.x')).toHaveAttribute('aria-hidden', 'true')
    const marks = [...doc.querySelectorAll('[data-testid="cell-error-mark"]')]
    expect(marks.map((m) => m.closest('[data-testid="cell-background"]'))).toEqual(wrong)
    for (const c of wrong)
      expect(c.querySelector('[data-testid="cell-digit"]')).toHaveTextContent('4')
    expect(doc.querySelector('[data-status="mistakes"]')?.textContent).toBe('1/3')
  })

  it('marks the walkthrough step and freezes the controls', async () => {
    const doc = await preview('walkthrough')
    expect(doc.querySelectorAll('ol[aria-label="Solver trace"] > li')).toHaveLength(47)
    const current = doc.querySelectorAll('[aria-current="step"]')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAttribute('data-step', '7')
    expect(doc.querySelector('fieldset#input-mode')).toHaveAttribute('disabled')
    expect(doc.querySelector('[data-placed]')?.id).toBe('cell-42')
    expect(doc.querySelectorAll('[data-struck]')).toHaveLength(1)
    expect(doc.querySelector('#steps-panel p[aria-live="polite"]')?.textContent.trim()).toBe(
      'Cell R5C7 has only one possible candidate left, 7.',
    )
  })

  it('says what the win took', async () => {
    const doc = await preview('win')
    expect(doc.getElementById('win-summary')?.textContent).toBe(
      'Easy puzzle finished in 12:34 with 1 mistake.',
    )
    expect(doc.getElementById('pause-button')).toHaveAttribute('hidden')
    expect(doc.querySelector('[data-status="solved"]')).not.toHaveAttribute('hidden')
    expect(doc.querySelectorAll('#win-dialog button[type="submit"][data-difficulty]')).toHaveLength(
      5,
    )
  })

  it('shows a toast in the region as a status', async () => {
    const doc = await preview('toast')
    const toast = doc.querySelector('#toasts > .toast')
    expect(toast?.textContent.trim()).toBe('Board cleared.')
    expect(toast).toHaveAttribute('role', 'status')
  })
})
