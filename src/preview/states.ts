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

import { INITIAL_VIEW } from '../components/initial'
import type { AppView, ControlsView, StatusView } from '../components/view'
import { CONFLICT, IDLE, NOTES, PLAYING, STEPS, WALKTHROUGH, WON } from './boards'

/** Fixture data for one static preview page per UI state, for a side-by-side review of each state. */
// A type rather than an interface, so it fits the props record a page receives.
export type PreviewState = {
  readonly view: AppView
  readonly toasts?: readonly string[]
}

const PLAYING_CONTROLS: ControlsView = {
  undo: { title: 'Undo' },
  redo: { disabled: true, title: 'Redo' },
  autoFill: { title: 'Auto-fill pencil marks' },
  erase: { title: 'Erase selected cell' },
  sticky: {},
  solve: { title: 'Reveal the solution with every solving step' },
  hint: { title: 'Show the next logical step' },
  clear: { title: 'Clear your progress and reset the puzzle.' },
}

/** Erase stays disabled while no cell is selected. */
const UNSELECTED_CONTROLS: ControlsView = {
  ...PLAYING_CONTROLS,
  erase: { disabled: true, title: 'Erase selected cell' },
}

const STATUS: StatusView = { difficulty: 'Easy', mistakes: 0, time: '02:05' }

const playing = (cells: AppView['cells'], controls = PLAYING_CONTROLS): AppView => ({
  mode: 'playing',
  cells,
  inputMode: 'normal',
  controls,
  status: STATUS,
})

const WALKTHROUGH_STEP = 7

export const PREVIEW_STATES: Readonly<Record<string, PreviewState>> = {
  selection: { view: INITIAL_VIEW },
  playing: { view: playing(PLAYING) },
  notes: { view: { ...playing(NOTES), inputMode: 'candidate' } },
  conflict: {
    view: {
      ...playing(CONFLICT, {
        ...PLAYING_CONTROLS,
        solve: { disabled: true, title: 'Cannot solve with conflicts.' },
      }),
      status: { ...STATUS, mistakes: 1 },
    },
  },
  win: {
    view: {
      ...playing(WON, {
        ...INITIAL_VIEW.controls,
        undo: { title: 'Undo' },
        solve: { disabled: true, title: 'Board is already full.' },
        clear: { title: 'Clear your progress and reset the puzzle.' },
      }),
      status: { difficulty: 'Easy', mistakes: 1, time: '12:34', solved: true },
      winSummary: 'Easy puzzle finished in 12:34 with 1 mistake.',
    },
  },
  confirm: { view: playing(IDLE, UNSELECTED_CONTROLS) },
  share: { view: playing(IDLE, UNSELECTED_CONTROLS) },
  'new-puzzle': { view: playing(IDLE, UNSELECTED_CONTROLS) },
  walkthrough: {
    view: {
      mode: 'visualizing',
      cells: WALKTHROUGH,
      playerCells: IDLE,
      inputMode: 'normal',
      controls: INITIAL_VIEW.controls,
      walkthrough: {
        steps: STEPS,
        current: WALKTHROUGH_STEP,
        explanation: 'Cell R5C7 has only one possible candidate left, 7.',
      },
    },
  },
  toast: {
    view: playing(PLAYING),
    toasts: ['Board cleared.'],
  },
}

export const previewPaths = () =>
  Object.entries(PREVIEW_STATES).map(([state, props]) => ({ params: { state }, props }))
