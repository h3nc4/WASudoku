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

import type { IconName } from './icons'
import type { AppView, InputMode, PadKey, StepTone, WalkthroughView } from './view'

export type Variant = 'primary' | 'destructive' | 'paper' | 'ghost'

export type Size = 'md' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg'

export interface ActionButton {
  readonly id: string
  readonly label: string
  readonly icon: IconName
  readonly variant: Variant
  readonly disabled?: boolean | undefined
  readonly title?: string | undefined
  readonly wide?: boolean
}

/** A ghost button fills its cell and the rest share the row. Clear spans both columns without a hint. */
export const actionClass = (action: ActionButton): string =>
  [action.variant === 'ghost' ? 'w-full' : 'flex-1', action.wide ? 'col-span-2' : '']
    .join(' ')
    .trim()

/** Hint and Solve while playing, else Solve, Start Puzzle or Exit, and Clear Board after them. */
export function actionButtons(view: AppView): readonly ActionButton[] {
  const { controls, mode } = view
  const clear: ActionButton = {
    id: 'clear-button',
    label: 'Clear Board',
    icon: 'eraser',
    variant: 'ghost',
    disabled: controls.clear.disabled,
    title: controls.clear.title,
    wide: mode !== 'playing',
  }
  const solve: ActionButton = {
    id: 'solve-button',
    label: 'Solve',
    icon: 'eye',
    variant: 'paper',
    disabled: controls.solve.disabled,
    title: controls.solve.title,
  }
  switch (mode) {
    case 'playing':
      return [
        {
          id: 'hint-button',
          label: 'Hint',
          icon: 'lightbulb',
          variant: 'paper',
          disabled: controls.hint.disabled,
          title: controls.hint.title,
        },
        solve,
        clear,
      ]
    case 'visualizing':
      return [
        { id: 'exit-button', label: 'Exit Visualization', icon: 'x', variant: 'destructive' },
        clear,
      ]
    case 'customInput':
      return [
        {
          id: 'start-button',
          label: 'Start Puzzle',
          icon: 'play',
          variant: 'primary',
          disabled: controls.solve.disabled,
          title: controls.solve.title,
        },
        clear,
      ]
    case 'selecting':
      return [solve, clear]
  }
}

/** Start Puzzle is the primary action while a custom board is entered, so New Puzzle steps back. */
export const newPuzzleVariant = (view: AppView): Variant =>
  view.mode === 'customInput' ? 'paper' : 'primary'

export const INPUT_MODES: readonly { readonly value: InputMode; readonly label: string }[] = [
  { value: 'normal', label: 'Pen' },
  { value: 'candidate', label: 'Corner' },
  { value: 'center', label: 'Center' },
]

/** The pad key's digit and count tones, with the locked key drawn in paper on its filled ink. */
export function padTones(key: PadKey, locked: boolean) {
  if (key.disabled) return { digit: 'text-disabled-foreground', count: 'text-disabled-foreground' }
  if (locked) return { digit: 'text-primary-foreground', count: 'text-primary-foreground' }
  return { digit: 'text-ink', count: 'text-muted-foreground' }
}

const ROW_TONE: Record<StepTone | 'reached', string> = {
  past: 'text-ink hover:bg-accent',
  current: 'text-solver bg-solver-wash font-semibold',
  future: 'text-muted-foreground hover:bg-accent',
  reached: 'text-solver font-semibold hover:bg-accent',
}

const TRACE_ROW =
  'voice-mono relative grid w-full grid-cols-[var(--trace-tag)_8ch_1fr] gap-x-[1.5ch] rounded-sm px-2 py-1 text-left text-xs tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-ring transition-[background-color] duration-(--motion-out) ease-out'

export const rowClass = (tone: StepTone | 'reached'): string => `${TRACE_ROW} ${ROW_TONE[tone]}`

/** The trace's first column fits the widest position, as many characters as the step count. */
export const traceStyle = (walkthrough: WalkthroughView): string =>
  `--trace-tag: ${String(String(walkthrough.steps.length).length)}ch`
