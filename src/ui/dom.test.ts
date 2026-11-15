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

import { describe, expect, it, vi } from 'vitest'

import {
  all,
  closestTo,
  Disposer,
  required,
  setAttr,
  setFlag,
  setHidden,
  setText,
  shallowEqual,
} from './dom'

describe('dom helpers', () => {
  it('finds a required element of its class, or throws naming it', () => {
    document.body.innerHTML = '<p id="a"></p><p></p><span></span>'
    expect(required(document, '#a', HTMLParagraphElement).id).toBe('a')
    expect(() => required(document, '#a', HTMLSpanElement)).toThrow(
      'The page has no HTMLSpanElement at #a',
    )
    expect(all(document, 'p, span', HTMLParagraphElement)).toHaveLength(2)
  })

  it('writes an attribute, a flag, text or hidden only when it differs', () => {
    const element = document.createElement('div')
    const set = vi.spyOn(element, 'setAttribute')
    setAttr(element, 'title', 'x')
    setAttr(element, 'title', 'x')
    expect(set).toHaveBeenCalledTimes(1)
    setAttr(element, 'title', undefined)
    setAttr(element, 'title', undefined)
    expect(element).not.toHaveAttribute('title')
    setFlag(element, 'data-on', true)
    expect(element).toHaveAttribute('data-on', '')
    setFlag(element, 'data-on', false)
    expect(element).not.toHaveAttribute('data-on')
    setText(element, 'a')
    const node = element.firstChild
    setText(element, 'a')
    expect(element.firstChild).toBe(node)
    setHidden(element, true)
    setHidden(element, true)
    expect(element.hidden).toBe(true)
  })

  it('finds the element an event came from, and nothing for a text node', () => {
    document.body.innerHTML = '<div class="row"><b>x</b></div>'
    const bold = document.querySelector('b')!
    const seen: (Element | null)[] = []
    document.body.addEventListener('click', (event) => seen.push(closestTo(event, '.row')))
    bold.click()
    bold.firstChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(seen).toEqual([document.querySelector('.row'), null])
  })

  it('compares flat records', () => {
    expect(shallowEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true)
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(shallowEqual<Record<string, number>>({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('removes every listener and cleanup at once', () => {
    const disposer = new Disposer()
    const target = document.createElement('button')
    const listener = vi.fn()
    const cleanup = vi.fn()
    disposer.on(target, 'click', listener)
    disposer.add(cleanup)
    target.click()
    disposer.dispose()
    target.click()
    disposer.dispose()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(disposer.signal.aborted).toBe(true)
  })
})
