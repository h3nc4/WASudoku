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

// The built page in jsdom, bound to a real store over fake ports, for the ui modules' tests.
import { inject, vi } from 'vitest'

import { PUZZLE, savedGame, SOLUTION } from '../../e2e/saves'
import { parseBoard } from '../core/board'
import type { State } from '../core/game/state'
import type { SolveResult, Step } from '../core/game/steps'
import { toCellIndex } from '../core/geometry'
import { loadSlices } from '../runtime/storage'
import { createStore, type RuntimeStore } from '../runtime/store'
import { fakeDeps, type Fakes, MemoryStorage } from './runtime-fakes'

export { PUZZLE, savedGame, SOLUTION }
export { solvedExcept, STORAGE_KEYS } from '../../e2e/saves'

/** jsdom lacks the modal and popover methods, so these stand in, as an engine would act. */
function stubTopLayer(doc: Document): void {
  for (const dialog of doc.querySelectorAll('dialog')) {
    dialog.showModal = () => {
      dialog.setAttribute('open', '')
    }
    dialog.close = (value?: string) => {
      if (!dialog.open) return
      if (value !== undefined) dialog.returnValue = value
      dialog.removeAttribute('open')
      dialog.dispatchEvent(new Event('close'))
    }
  }
  for (const element of doc.querySelectorAll<HTMLElement>('[popover]')) {
    const toggle = (open: boolean) => {
      element.toggleAttribute('data-popover-open', open)
      element.dispatchEvent(
        Object.assign(new Event('toggle'), { newState: open ? 'open' : 'closed' }),
      )
    }
    element.showPopover = () => {
      toggle(true)
    }
    element.hidePopover = () => {
      if (element.hasAttribute('data-popover-open')) toggle(false)
    }
  }
}

/** Replaces an element's scrollTo, which jsdom lacks. */
export const scrolled = vi.fn()

/** Mounts the built page's body without its scripts, its top layer stubbed. */
export function mountPage(): Document {
  const built = new DOMParser().parseFromString(inject('builtPage'), 'text/html')
  document.documentElement.dataset['theme'] = built.documentElement.dataset['theme'] ?? 'dark'
  document.body.replaceChildren(
    ...[...built.body.childNodes].map((node) => document.importNode(node, true)),
  )
  for (const script of document.querySelectorAll('script')) script.remove()
  // The layout binding owns inert, and an engine keeps focus out of an inert board.
  document.querySelector('main')?.removeAttribute('inert')
  stubTopLayer(document)
  scrolled.mockClear()
  Element.prototype.scrollTo = scrolled
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
  return document
}

export interface Harness extends Fakes {
  readonly store: RuntimeStore
  /** The state now, for a test that needs a request id. */
  readonly state: () => State
}

/** A store loaded from `initial`, as the runtime starts it. */
export function harness(
  initial: Record<string, string> = {},
  options: Omit<NonNullable<Parameters<typeof fakeDeps>[0]>, 'storage'> = {},
): Harness {
  const fakes = fakeDeps({ ...options, storage: new MemoryStorage(initial) })
  const store = createStore(fakes.deps)
  store.dispatch({ type: 'loaded', slices: loadSlices(fakes.deps.storage, fakes.deps.log) })
  const state = store.select((current) => current)
  return { ...fakes, store, state }
}

/** A game in play, the saved PUZZLE one move past its start. */
export const playing = (board?: string): Harness =>
  harness({ 'wasudoku.state.game': savedGame(board === undefined ? {} : { board }) })

const at = (index: number) => {
  const cell = toCellIndex(index)
  if (cell === null) throw new Error(`no cell ${String(index)}`)
  return cell
}

/** Single steps over PUZZLE for a walkthrough to step through. */
export const STEPS: readonly Step[] = [
  {
    technique: 'NakedSingle',
    placements: [{ index: at(2), digit: 4 }],
    eliminations: [],
    cause: [],
  },
  {
    technique: 'HiddenSingle',
    placements: [{ index: at(3), digit: 6 }],
    eliminations: [{ index: at(5), digit: 6 }],
    cause: [{ index: at(4), candidates: 0 }],
  },
]

/** Answers the pending solve with STEPS, which opens the walkthrough at the solution. */
export function answerSolve(test: Harness, steps: readonly Step[] = STEPS): void {
  const id = test.state().pending?.id
  const solution = parseBoard(SOLUTION)
  if (id === undefined || solution === null) throw new Error('no solve is pending')
  const result: SolveResult = { steps, solution }
  test.store.dispatch({ type: 'solved', id, result })
}

/** The id of the request the player waits on. */
export const pendingId = (test: Harness): number => {
  const id = test.state().pending?.id
  if (id === undefined) throw new Error('nothing is pending')
  return id
}
