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

import { harness, mountPage, playing, solvedExcept } from '../test/app-page'
import { bindPad, drawKey, samePadKey } from './pad'

const key = (digit: number) =>
  document.querySelector<HTMLButtonElement>(`#number-pad [data-digit="${String(digit)}"]`)!
const count = (digit: number) => key(digit).querySelector<HTMLElement>('[data-count]')!
const glyph = (digit: number) => key(digit).querySelector<HTMLElement>('.pad-strike')!

describe('bindPad', () => {
  let dispose: () => void = () => undefined

  beforeEach(() => {
    mountPage()
  })

  afterEach(() => {
    dispose()
    vi.unstubAllGlobals()
  })

  it('counts what each digit has left and enters it on a press', () => {
    const test = playing()
    dispose = bindPad(document, test.store)
    expect(count(5)).toHaveTextContent('6')
    expect(key(5)).toHaveAttribute('aria-label', 'Enter number 5, 6 left')
    expect(key(5).disabled).toBe(false)
    expect(glyph(5)).toHaveClass('text-ink')
    test.store.dispatch({ type: 'select', index: 2 as never })
    key(4).click()
    expect(test.state().input.highlight).toBe(4)
    expect(count(4)).toHaveTextContent(String(9 - 3))
  })

  it('strikes a spent digit and disables it, and every key on a read-only board', () => {
    const test = playing()
    dispose = bindPad(document, test.store)
    test.store.dispatch({ type: 'pause' })
    expect(key(1).disabled).toBe(true)
    expect(glyph(1)).toHaveClass('text-disabled-foreground')
    expect(glyph(1)).not.toHaveClass('text-ink')
    test.store.dispatch({ type: 'resume' })
    expect(glyph(1)).toHaveClass('text-ink')
  })

  it('draws the locked key filled and pressed under sticky numbers', () => {
    const test = playing()
    dispose = bindPad(document, test.store)
    expect(key(3)).not.toHaveAttribute('aria-pressed')
    test.store.dispatch({ type: 'toggleSticky' })
    expect(key(3)).toHaveAttribute('aria-pressed', 'false')
    key(3).click()
    expect(key(3)).toHaveAttribute('aria-pressed', 'true')
    expect(key(3)).toHaveAttribute('data-variant', 'primary')
    expect(glyph(3)).toHaveClass('text-primary-foreground')
    key(3).click()
    expect(key(3)).toHaveAttribute('data-variant', 'paper')
  })

  it('shows a spent digit with no count', () => {
    const test = playing(solvedExcept(78))
    dispose = bindPad(document, test.store)
    expect(count(9).hidden).toBe(true)
    expect(glyph(9)).toHaveAttribute('data-struck', '')
    expect(key(9)).toHaveAttribute('aria-label', 'Enter number 9')
    expect(count(1)).toHaveTextContent('1')
    expect(count(1).hidden).toBe(false)
  })

  it('ignores a click between the keys', () => {
    const test = harness()
    dispose = bindPad(document, test.store)
    const before = test.state()
    document.getElementById('number-pad')!.click()
    expect(test.state()).toBe(before)
  })

  it('compares keys, and draws nothing for a key the pad lacks', () => {
    const key = { digit: 1, remaining: 2, disabled: false, locked: false, pressed: null } as const
    expect(samePadKey(key, { ...key })).toBe(true)
    expect(samePadKey(key, { ...key, remaining: 1 })).toBe(false)
    expect(samePadKey(undefined, key)).toBe(false)
    expect(samePadKey(undefined, undefined)).toBe(true)
    const button = document.createElement('button')
    drawKey(button, undefined)
    expect(button.attributes).toHaveLength(0)
  })
})
