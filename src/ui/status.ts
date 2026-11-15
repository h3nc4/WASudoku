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

import { iconHref } from '../components/icons'
import { isMistakeLimit, mistakesText } from '../components/view'
import { selectSeconds, selectStatus, type StatusView } from '../core/game/selectors'
import { formatTime } from '../core/text/format'
import { difficultyName, PAUSE_LABELS } from '../core/text/labels'
import { watch } from '../runtime/signals'
import type { Store } from '../runtime/store'
import { Disposer, required, setAttr, setHidden, setText, shallowEqual } from './dom'

/** The classes GameStatus.astro gives a mistake count at the limit. */
const OVER_LIMIT = ['text-error', 'font-bold']

const sameStatus = (a: StatusView | null, b: StatusView | null): boolean =>
  a === null || b === null ? a === b : shallowEqual(a, b)

/** Binds the status bar. Only the clock text is written on a tick. */
export function bindStatus(doc: Document, store: Store): () => void {
  const bar = required(doc, '#game-status', HTMLElement)
  const part = (name: string) => required(bar, `[data-status="${name}"]`, HTMLElement)
  const difficulty = part('difficulty')
  const mistakes = part('mistakes')
  const time = part('time')
  const solved = part('solved')
  const pause = required(bar, '#pause-button', HTMLButtonElement)
  const pauseIcon = required(pause, 'use', SVGElement)
  const disposer = new Disposer()

  const status = store.select(selectStatus, sameStatus)
  disposer.add(
    watch(() => {
      const current = status()
      setHidden(bar, current === null)
      if (current === null) return
      setText(difficulty, difficultyName(current.difficulty))
      setText(mistakes, mistakesText(current.mistakes))
      for (const name of OVER_LIMIT)
        mistakes.classList.toggle(name, isMistakeLimit(current.mistakes))
      setHidden(solved, !current.solved)
      setHidden(pause, current.solved)
      const label = current.paused ? PAUSE_LABELS.resume : PAUSE_LABELS.pause
      setAttr(pause, 'aria-label', label)
      setAttr(pause, 'title', label)
      setAttr(pauseIcon, 'href', iconHref(current.paused ? 'play' : 'pause'))
    }),
  )

  const seconds = store.select(selectSeconds)
  disposer.add(
    watch(() => {
      setText(time, formatTime(seconds()))
    }),
  )

  disposer.on(pause, 'click', () => {
    store.dispatch({ type: status()?.paused === true ? 'resume' : 'pause' })
  })
  return disposer.dispose
}
