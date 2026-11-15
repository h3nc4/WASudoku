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

import { iconHref } from '../components-next/icons'
import {
  type Controls,
  INPUT_MODES,
  type Mode,
  selectControls,
  selectInputMode,
  selectMode,
} from '../core/game/selectors'
import { BUTTON_LABELS, CLEAR_TITLES, SOLVE_TITLES, START_TITLES } from '../core/text/labels'
import { watch } from '../runtime/signals'
import type { Store } from '../runtime/store'
import { all, Disposer, required, setAttr, setText, shallowEqual } from './dom'

/** A busy label shows only for a request that runs this long, so a quick one never flickers. */
export const BUSY_LABEL_DELAY_MS = 500

export interface ControlPorts {
  /** Asks before the solve that spoils a game in play, and solves on confirm. */
  readonly confirmReveal: () => void
  readonly notify: (notice: 'cleared' | 'autoFilled') => void
}

const solveTitle = (mode: Mode, controls: Controls): string => {
  if (mode === 'won') return SOLVE_TITLES.full
  if (mode !== 'playing') return SOLVE_TITLES.empty
  return SOLVE_TITLES[controls.solveBlock ?? 'ready']
}

const played = (mode: Mode): boolean => mode === 'playing' || mode === 'won'

const clearTitle = (mode: Mode, controls: Controls): string =>
  CLEAR_TITLES[controls.clearBlock ?? (played(mode) ? 'playing' : 'other')]

/** Enables the controls the state allows, and sends each press to the store. */
export function bindControls(doc: Document, store: Store, ports: ControlPorts): () => void {
  const button = (id: string) => required(doc, `#${id}`, HTMLButtonElement)
  const undo = button('undo-button')
  const redo = button('redo-button')
  const autoFill = button('autofill-button')
  const erase = button('erase-button')
  const sticky = button('sticky-button')
  const stickyIcon = required(sticky, 'use', SVGElement)
  const hint = button('hint-button')
  const solve = button('solve-button')
  const exit = button('exit-button')
  const start = button('start-button')
  const clear = button('clear-button')
  const newButton = button('new-button')
  const label = (target: HTMLElement) => required(target, '[data-label]', HTMLElement)
  const fieldset = required(doc, '#input-mode', HTMLFieldSetElement)
  const radios = all(fieldset, 'input[type="radio"]', HTMLInputElement)
  const disposer = new Disposer()

  const controls = store.select(selectControls, shallowEqual<Controls>)
  const mode = store.select(selectMode)
  disposer.add(
    watch(() => {
      const current = controls()
      const shown = mode()
      undo.disabled = !current.undo
      redo.disabled = !current.redo
      autoFill.disabled = !current.autoFill
      erase.disabled = !current.erase
      sticky.disabled = !current.sticky
      setAttr(sticky, 'aria-pressed', String(current.stickyOn))
      setAttr(sticky, 'data-variant', current.stickyOn ? 'primary' : 'paper')
      setAttr(stickyIcon, 'href', iconHref(current.stickyOn ? 'lock' : 'lock-open'))
      hint.disabled = !current.hint
      solve.disabled = !current.solve
      setAttr(solve, 'title', solveTitle(shown, current))
      start.disabled = !current.validate
      setAttr(start, 'title', current.validate ? START_TITLES.ready : START_TITLES.empty)
      clear.disabled = !current.clear
      setAttr(clear, 'title', clearTitle(shown, current))
      newButton.toggleAttribute('disabled', !current.newPuzzle)
      fieldset.disabled = !current.inputMode
    }),
  )

  const busy = store.select((state) => selectControls(state).busy)
  let timer: ReturnType<typeof setTimeout> | undefined
  disposer.add(() => {
    clearTimeout(timer)
  })
  disposer.add(
    watch(() => {
      const task = busy()
      clearTimeout(timer)
      const show = () => {
        setText(
          label(newButton),
          task === 'generate' ? BUTTON_LABELS.generating : BUTTON_LABELS.newPuzzle,
        )
        setText(label(solve), task === 'solve' ? BUTTON_LABELS.solving : BUTTON_LABELS.solve)
        setText(label(start), task === 'validate' ? BUTTON_LABELS.validating : BUTTON_LABELS.start)
      }
      if (task === null || task === 'hint') show()
      else timer = setTimeout(show, BUSY_LABEL_DELAY_MS)
    }),
  )

  const inputMode = store.select(selectInputMode)
  disposer.add(
    watch(() => {
      const current = inputMode()
      for (const radio of radios) radio.checked = radio.value === current
    }),
  )
  disposer.on(fieldset, 'change', (event) => {
    const chosen = INPUT_MODES.find(
      (value) => event.target instanceof HTMLInputElement && event.target.value === value,
    )
    if (chosen !== undefined) store.dispatch({ type: 'setMode', mode: chosen })
  })

  const press = (target: HTMLElement, run: () => void) => {
    disposer.on(target, 'click', run)
  }
  press(undo, () => {
    store.dispatch({ type: 'undo' })
  })
  press(redo, () => {
    store.dispatch({ type: 'redo' })
  })
  press(autoFill, () => {
    store.dispatch({ type: 'autoFill' })
    ports.notify('autoFilled')
  })
  press(erase, () => {
    store.dispatch({ type: 'erase', how: 'delete' })
  })
  press(sticky, () => {
    store.dispatch({ type: 'toggleSticky' })
  })
  press(hint, () => {
    store.dispatch({ type: 'hint' })
  })
  // Solve is enabled only in play, where it spoils the game and asks first.
  press(solve, ports.confirmReveal)
  press(exit, () => {
    store.dispatch({ type: 'exitWalkthrough' })
  })
  press(start, () => {
    store.dispatch({ type: 'validate' })
  })
  press(clear, () => {
    store.dispatch({ type: 'clear' })
    ports.notify('cleared')
  })
  return disposer.dispose
}
