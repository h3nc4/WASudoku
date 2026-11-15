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

// The built page bound to a real store in a real engine, for the focus and dialog paths jsdom fakes.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'

import { bindKeyboard } from '../runtime/keyboard'
import { answerSolve, type Harness, harness, playing, PUZZLE } from '../test/app-page'
import { mountBuiltPage } from '../test/built-page'
import { mountApp } from './app'
import { createToaster } from './toast'

const byId = (id: string) => document.getElementById(id)!
const cell = (index: number) => byId(`cell-${String(index)}`)
const dialog = (id: string) => byId(id) as HTMLDialogElement

describe('the bound page in a real engine', () => {
  const disposers: (() => void)[] = []

  beforeEach(() => {
    mountBuiltPage()
  })

  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose()
    for (const open of document.querySelectorAll('dialog')) open.close()
    document.body.innerHTML = ''
  })

  function start(test: Harness = playing()) {
    const toaster = createToaster(byId('toasts'), { reducedMotion: () => true })
    disposers.push(
      toaster.dispose,
      bindKeyboard(document, test.store),
      mountApp(document, test.store, {
        toaster,
        address: { search: '', href: location.href },
        history: { state: null, replaceState: () => undefined },
      }),
    )
    return test
  }

  it('keeps one tab stop on the grid, and focus with the cell the arrows select', async () => {
    const test = start()
    byId('pause-button').focus()
    await userEvent.tab()
    expect(cell(0)).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(cell(2)).toHaveFocus()
    expect(cell(2)).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('4')
    expect(cell(2).querySelector('.d')?.textContent).toBe('4')
    await userEvent.keyboard('{End}')
    expect(cell(8)).toHaveFocus()
    await userEvent.tab()
    expect(cell(8)).not.toHaveFocus()
    await expect.poll(() => test.state().input.selected).toBeNull()
    expect(cell(8).tabIndex).toBe(0)
  })

  it('leaves focus on the cell when the pad enters a digit with a pointer', async () => {
    start()
    await userEvent.click(cell(2))
    await userEvent.click(document.querySelector('#number-pad [data-digit="4"]')!)
    expect(cell(2)).toHaveFocus()
    expect(cell(2).querySelector('.d')?.textContent).toBe('4')
  })

  it('asks before revealing, Esc keeping the game and the confirm starting the walkthrough', async () => {
    const test = start()
    await userEvent.click(byId('solve-button'))
    expect(dialog('reveal-dialog').matches(':modal')).toBe(true)
    expect(document.activeElement).toHaveTextContent('Cancel')
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => dialog('reveal-dialog').open).toBe(false)
    expect(test.state().pending).toBeNull()
    await userEvent.click(byId('solve-button'))
    await userEvent.click(dialog('reveal-dialog').querySelector('button[value="confirm"]')!)
    await expect.poll(() => test.state().pending?.task).toBe('solve')
    answerSolve(test)
    expect(byId('steps-panel').hidden).toBe(false)
    await userEvent.click(byId('step-start'))
    expect(byId('step-start')).toHaveAttribute('aria-current', 'step')
  })

  it('confirms an abandon from the new puzzle menu', async () => {
    const test = start()
    await userEvent.click(cell(2))
    await userEvent.keyboard('4')
    await userEvent.click(byId('new-button'))
    await expect.poll(() => byId('new-menu').matches(':popover-open')).toBe(true)
    await userEvent.click(byId('new-menu').querySelector('[data-difficulty="expert"]')!)
    await expect.poll(() => dialog('abandon-dialog').open).toBe(true)
    await userEvent.click(dialog('abandon-dialog').querySelector('button[value="confirm"]')!)
    await expect.poll(() => test.state().pending).toMatchObject({ difficulty: 'expert' })
  })

  it('offers a shared puzzle in a modal dialog and starts it on confirm', async () => {
    const test = start(harness())
    test.store.dispatch({
      type: 'opened',
      search: `?p=${PUZZLE}`,
      href: `${location.origin}/?p=${PUZZLE}`,
    })
    expect(dialog('pending-dialog').matches(':modal')).toBe(true)
    await userEvent.click(dialog('pending-dialog').querySelector('button[value="confirm"]')!)
    await expect.poll(() => test.state().game.mode).toBe('entering')
    expect(test.state().offer).toBeNull()
  })
})
