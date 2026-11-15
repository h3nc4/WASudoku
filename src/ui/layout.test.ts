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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LAYOUT_CLASSES } from '../components/controls'
import { answerSolve, harness, mountPage, playing } from '../test/app-page'
import { ACTIONS, bindLayout } from './layout'

const byId = (id: string) => document.getElementById(id)!
const shown = () =>
  ['hint-button', 'solve-button', 'exit-button', 'start-button', 'clear-button'].filter(
    (id) => !byId(id).hidden,
  )

describe('bindLayout', () => {
  let dispose: () => void = () => undefined

  beforeEach(() => {
    mountPage()
  })

  afterEach(() => {
    dispose()
    vi.unstubAllGlobals()
  })

  it('keeps the selection screen over an inert board on a first visit', () => {
    dispose = bindLayout(document, harness().store)
    expect(byId('selection-screen').hidden).toBe(false)
    expect(document.querySelector('main')!.inert).toBe(true)
    expect(document.querySelector('main')).toHaveClass('opacity-35')
    expect(shown()).toEqual(ACTIONS.selecting)
    expect(byId('clear-button')).toHaveClass('col-span-2')
    for (const item of document.querySelectorAll<HTMLElement>('#new-menu [data-custom]'))
      expect(item.hidden).toBe(true)
  })

  it('shows play, entry and the walkthrough each with their own buttons', () => {
    const test = playing()
    dispose = bindLayout(document, test.store)
    expect(byId('selection-screen').hidden).toBe(true)
    expect(document.querySelector('main')!.inert).toBe(false)
    expect(shown()).toEqual(ACTIONS.playing)
    expect(byId('clear-button')).not.toHaveClass('col-span-2')
    expect(byId('new-button')).toHaveAttribute('data-variant', 'primary')
    expect(
      document.querySelector<HTMLButtonElement>('#new-menu [data-action="custom"]')!.disabled,
    ).toBe(false)

    test.store.dispatch({ type: 'solve' })
    answerSolve(test)
    expect(shown()).toEqual(ACTIONS.walkthrough)
    expect(byId('steps-panel').hidden).toBe(false)
    expect(byId('scroll-hint').hidden).toBe(false)
    expect(byId('layout')).toHaveClass(...LAYOUT_CLASSES.walkthrough.split(' '))
    expect(byId('layout')).not.toHaveClass('flex-col')

    test.store.dispatch({ type: 'exitWalkthrough' })
    expect(byId('layout')).toHaveClass(...LAYOUT_CLASSES.play.split(' '))
    test.store.dispatch({ type: 'enterCustom' })
    expect(shown()).toEqual(ACTIONS.entering)
    expect(byId('new-button')).toHaveAttribute('data-variant', 'paper')
  })
})
