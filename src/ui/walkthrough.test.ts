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

import { answerSolve, mountPage, playing, scrolled, STEPS } from '../test/app-page'
import { bindWalkthrough, traceRow, traceScroll } from './walkthrough'

const byId = (id: string) => document.getElementById(id)!
const rows = () => [...document.querySelectorAll<HTMLElement>('#solver-trace button[data-step]')]
const currentStep = () => document.querySelector('[aria-current="step"]')?.getAttribute('data-step')

describe('traceRow', () => {
  it('draws a row as StepsPanel.astro does', () => {
    const row = traceRow(document, STEPS[0], 1, 12)
    expect(row.id).toBe('solver-step-0')
    expect(row.querySelector('button')).toHaveAttribute('data-step', '1')
    expect([...row.querySelectorAll('span')].map((span) => span.textContent)).toEqual([
      'Step',
      '01',
      'R1C3 = 4',
      'Naked Single',
    ])
    expect(row.querySelector('span')).toHaveClass('sr-only')
  })
})

describe('traceScroll', () => {
  const view = { top: 100, bottom: 200 }

  it('scrolls a row above or below the trace just into it', () => {
    expect(traceScroll(view, { top: 80, bottom: 100 }, 50)).toBe(30)
    expect(traceScroll(view, { top: 190, bottom: 210 }, 50)).toBe(60)
  })

  it('leaves a row already in view alone', () => {
    expect(traceScroll(view, { top: 100, bottom: 200 }, 50)).toBeNull()
  })

  it('goes back to the top without a row, unless already there', () => {
    expect(traceScroll(view, undefined, 50)).toBe(0)
    expect(traceScroll(view, undefined, 0)).toBeNull()
  })
})

describe('bindWalkthrough', () => {
  let dispose: () => void = () => undefined

  beforeEach(() => {
    mountPage()
  })

  afterEach(() => {
    dispose()
    vi.unstubAllGlobals()
  })

  function start() {
    const test = playing()
    dispose = bindWalkthrough(document, test.store)
    test.store.dispatch({ type: 'solve' })
    answerSolve(test)
    return test
  }

  // Logic stops short of the solution. The walkthrough then ends on an appended backtracking step.
  it('lists the trace and opens at the solution', () => {
    start()
    expect(rows()).toHaveLength(3)
    expect(rows()[2]).toHaveTextContent('Backtracking')
    expect(byId('step-count')).toHaveTextContent('3/3')
    // The solution shares the board of the last step, which keeps the mark.
    expect(currentStep()).toBe('3')
    expect(byId('step-end').className).toContain('font-semibold')
    expect(byId('step-end')).not.toHaveAttribute('aria-current')
    expect(byId('next-step')).toBeDisabled()
    expect(byId('previous-step')).toBeEnabled()
    expect(document.querySelector('[data-solved-in]')).toHaveTextContent('Solved in 3 steps')
    expect(document.querySelector<HTMLElement>('[data-solved-in]')!.hidden).toBe(false)
    expect(document.querySelector('#steps-panel section')).toHaveStyle('--trace-tag: 1ch')
  })

  it('steps back and forth, marking the current row and its explanation', () => {
    const test = start()
    byId('previous-step').click()
    expect(currentStep()).toBe('2')
    byId('previous-step').click()
    expect(currentStep()).toBe('1')
    expect(byId('step-explanation')).toHaveTextContent(
      'Cell R1C3 has only one possible candidate left, 4.',
    )
    expect(document.querySelector<HTMLElement>('[data-solved-in]')!.hidden).toBe(true)
    byId('next-step').click()
    expect(currentStep()).toBe('2')
    byId('step-start').click()
    expect(currentStep()).toBe('0')
    expect(byId('previous-step')).toBeDisabled()
    expect(byId('step-explanation')).toHaveTextContent('The puzzle as given.')
    rows()[0].querySelector('span')!.click()
    expect(test.state().game.mode === 'walkthrough' && test.state().game).toMatchObject({
      walk: { cursor: 1 },
    })
  })

  // Element.scrollIntoView would scroll the window as well, so the page must never see it.
  it('scrolls only the trace to the current row, and to its top at the start', () => {
    const intoView = vi.fn()
    Element.prototype.scrollIntoView = intoView
    const test = start()
    const trace = byId('solver-trace')
    const rect = (top: number, bottom: number) => ({ top, bottom }) as DOMRect
    trace.getBoundingClientRect = () => rect(0, 100)
    rows()[1].getBoundingClientRect = () => rect(120, 140)
    scrolled.mockClear()
    byId('previous-step').click()
    expect(scrolled).toHaveBeenCalledExactlyOnceWith({ top: 40, behavior: 'instant' })
    expect(scrolled.mock.contexts[0]).toBe(trace)
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    Object.defineProperty(trace, 'scrollTop', { value: 40 })
    test.store.dispatch({ type: 'viewStep', cursor: 0 })
    expect(scrolled).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' })
    expect(intoView).not.toHaveBeenCalled()
  })

  it('ignores a click on the panel outside a row, and redraws a new trace', () => {
    const test = start()
    const before = test.state()
    byId('step-count').click()
    expect(test.state()).toBe(before)
    test.store.dispatch({ type: 'exitWalkthrough' })
    test.store.dispatch({ type: 'solve' })
    answerSolve(test, [STEPS[0]])
    expect(rows()).toHaveLength(2)
    expect(byId('step-end')).toHaveAttribute('data-step', '2')
  })
})
