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

// Axe over the page Astro builds, with every widget bound, in the states a player reaches first.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commands, userEvent } from 'vitest/browser'

import { NOTICES, TOAST_ACTIONS } from '../core/text/messages'
import { mountBuiltPage } from '../test/built-page'
import { bindDialog, type DialogHandle } from './dialog'
import { bindGrid } from './grid'
import { bindMenu } from './menu'
import { bindThemeToggle } from './theme'
import { createToaster, type Toaster } from './toast'

const settled = (element: Element) =>
  Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished))

describe('the built page with its widgets bound', () => {
  const disposers: (() => void)[] = []
  const dialogs = new Map<string, DialogHandle>()
  const byId = (id: string) => document.getElementById(id)!
  let toaster: Toaster

  beforeAll(() => {
    mountBuiltPage()
    toaster = createToaster(byId('toasts'))
    disposers.push(toaster.dispose)
    for (const menu of document.querySelectorAll<HTMLElement>('[role="menu"][popover]')) {
      disposers.push(bindMenu(menu).dispose)
    }
    for (const dialog of document.querySelectorAll('dialog')) {
      const handle = bindDialog(dialog, { onOpen: toaster.raise })
      dialogs.set(dialog.id, handle)
      disposers.push(handle.dispose)
    }
    disposers.push(bindThemeToggle(byId('theme-button')))
    disposers.push(bindGrid(byId('board'), { onSelect: () => undefined }).dispose)
  })

  afterAll(() => {
    for (const dispose of disposers) dispose()
    document.body.innerHTML = ''
  })

  it('passes axe on the first visit', async () => {
    expect(await commands.axe()).toEqual([])
  })

  it('passes axe with the share menu open', async () => {
    await userEvent.click(byId('share-button'))
    await expect.poll(() => byId('share-menu').matches(':popover-open')).toBe(true)
    await settled(byId('share-menu'))
    expect(await commands.axe()).toEqual([])
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => byId('share-button').getAttribute('aria-expanded')).toBe('false')
  })

  it('passes axe with a dialog open, and with a toast over it', async () => {
    const dialog = dialogs.get('abandon-dialog')!
    dialog.open()
    await settled(byId('abandon-dialog'))
    expect(await commands.axe()).toEqual([])
    const item = toaster.show(NOTICES.cleared, {
      duration: Infinity,
      action: { label: TOAST_ACTIONS.undo, run: () => undefined },
    })
    expect(byId('toasts').parentElement).toBe(byId('abandon-dialog'))
    await settled(item)
    expect(await commands.axe()).toEqual([])
    dialog.close()
  })
})
