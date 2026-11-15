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

import { describe, expect, it } from 'vitest'

import {
  actionButtons,
  actionClass,
  actionSlots,
  LAYOUT_CLASSES,
  newPuzzleVariant,
  padTones,
  rowClass,
  stepsPanel,
  traceStyle,
} from './controls'
import { iconHref } from './icons'
import { INITIAL_VIEW } from './initial'
import {
  BLANK_STATUS,
  BLANK_WALKTHROUGH,
  boardRows,
  cellLabel,
  type CellView,
  centerSize,
  endRow,
  isMistakeLimit,
  isReadOnly,
  isSolution,
  mistakesText,
  padKeys,
  padLabel,
  solvedInText,
  statusBar,
  stepTag,
  stepTone,
  tabStop,
  traceRows,
  type WalkthroughView,
} from './view'

const empty = (): CellView[] => Array.from({ length: 81 }, () => ({}))

describe('cellLabel', () => {
  it('names a given digit', () => {
    expect(cellLabel(0, { value: 5, given: true })).toBe('R1C1, 5, given')
  })

  it('tells notes apart from a placed digit', () => {
    expect(cellLabel(10, { corner: [3, 7] })).toBe('R2C2, empty, candidates 3, 7')
    expect(cellLabel(10, { corner: [7] })).toBe('R2C2, empty, candidates 7')
    expect(cellLabel(80, { center: [1, 4, 9] })).toBe('R9C9, empty, center notes 1, 4, 9')
    expect(cellLabel(80, { value: 7 })).toBe('R9C9, 7')
  })

  it('says a wrong digit is wrong', () => {
    expect(cellLabel(21, { value: 4, invalid: true })).toBe('R3C4, 4, wrong')
  })
})

describe('boardRows', () => {
  it('draws nine rows of nine cells with one tab stop', () => {
    const rows = boardRows(empty())
    expect(rows).toHaveLength(9)
    const cells = rows.flat()
    expect(cells).toHaveLength(81)
    expect(cells.filter((c) => c.attributes.tabindex === 0)).toHaveLength(1)
    expect(cells[0]?.attributes.tabindex).toBe(0)
  })

  it('moves the tab stop to the selected cell', () => {
    const cells = empty()
    cells[40] = { selected: true }
    expect(tabStop(cells)).toBe(40)
    expect(boardRows(cells).flat()[40]?.attributes['aria-selected']).toBe('true')
  })

  it('fills a short board with empty cells', () => {
    expect(boardRows([]).flat()[80]?.attributes['aria-label']).toBe('R9C9, empty')
  })

  it('prefers center notes and strikes eliminated corners', () => {
    const cells = empty()
    cells[0] = { corner: [1, 2], center: [3] }
    cells[1] = { corner: [1, 2], struck: [2] }
    cells[2] = { value: 4, invalid: true, corner: [1] }
    const [first, second, third] = boardRows(cells).flat()
    expect(first?.center).toEqual({ digits: [3], size: 'few' })
    expect(first?.corner).toBeUndefined()
    expect(second?.corner?.map((s) => s.digit)).toEqual([
      1,
      2,
      ...Array<undefined>(7).fill(undefined),
    ])
    expect(second?.corner?.map((s) => s.struck).slice(0, 2)).toEqual([undefined, ''])
    expect(third?.wrong).toBe(true)
    expect(third?.corner).toBeUndefined()
  })

  it('maps every state to an attribute', () => {
    const cells = empty()
    cells[0] = {
      given: true,
      peer: true,
      same: true,
      solved: true,
      placed: true,
      cause: true,
      target: true,
    }
    expect(boardRows(cells).flat()[0]?.attributes).toMatchObject({
      'aria-readonly': 'true',
      'data-peer': '',
      'data-same': '',
      'data-solved': '',
      'data-placed': '',
      'data-cause': '',
      'data-target': '',
    })
  })
})

describe('centerSize', () => {
  it('drops a size past four notes', () => {
    expect(centerSize([1, 2, 3, 4])).toBe('few')
    expect(centerSize([1, 2, 3, 4, 5])).toBe('many')
  })
})

describe('padLabel', () => {
  it('says what a digit has left, and nothing once it is spent', () => {
    expect(padLabel(3, 2)).toBe('Enter number 3, 2 left')
    expect(padLabel(3, 0)).toBe('Enter number 3')
  })
})

describe('padKeys', () => {
  it('counts what is left and spends a complete digit', () => {
    const cells = empty().map((_, i): CellView => (i < 9 ? { value: 1 } : {}))
    const [one, two] = padKeys(cells, false)
    expect(one).toEqual({ digit: 1, remaining: 0, disabled: true, label: 'Enter number 1' })
    expect(two).toEqual({
      digit: 2,
      remaining: 9,
      disabled: false,
      label: 'Enter number 2, 9 left',
    })
    expect(padKeys(cells, true)[1]?.disabled).toBe(true)
  })

  it('tones a key by its state', () => {
    const key = { digit: 2, remaining: 3, disabled: false, label: '' } as const
    expect(padTones(key, false).digit).toBe('text-ink')
    expect(padTones(key, true).digit).toBe('text-primary-foreground')
    expect(padTones({ ...key, disabled: true }, true).count).toBe('text-disabled-foreground')
  })
})

describe('status', () => {
  it('reads read-only from the mode and the win', () => {
    expect(isReadOnly(INITIAL_VIEW)).toBe(true)
    const playing = { ...INITIAL_VIEW, mode: 'playing' as const }
    expect(isReadOnly(playing)).toBe(false)
    expect(isReadOnly({ ...playing, mode: 'visualizing' })).toBe(true)
    expect(
      isReadOnly({
        ...playing,
        status: { difficulty: 'Easy', mistakes: 0, time: '00:01', solved: true },
      }),
    ).toBe(true)
  })

  it('counts mistakes against the limit', () => {
    expect(mistakesText(2)).toBe('2/3')
    expect(isMistakeLimit(2)).toBe(false)
    expect(isMistakeLimit(3)).toBe(true)
  })

  it('paints a blank, hidden bar without a status, its clock from the formatter', () => {
    expect(statusBar(undefined)).toEqual({ view: BLANK_STATUS, hidden: true })
    expect(BLANK_STATUS.time).toBe('00:00')
    const status = { difficulty: 'Easy', mistakes: 1, time: '12:34' }
    expect(statusBar(status)).toEqual({ view: status, hidden: false })
  })
})

describe('walkthrough', () => {
  const walk = (current: number): WalkthroughView => ({
    steps: Array.from({ length: 12 }, () => ({ where: 'R1C1 = 1', label: 'Naked Single' })),
    current,
    explanation: '',
  })

  it('pads positions and tones rows around the current one', () => {
    expect(stepTag(3, 12)).toBe('03')
    expect(stepTone(2, 3)).toBe('past')
    expect(stepTone(3, 3)).toBe('current')
    expect(stepTone(4, 3)).toBe('future')
    const rows = traceRows(walk(3))
    expect(rows[2]).toMatchObject({ position: 3, tag: '03', tone: 'current' })
    expect(traceStyle(walk(3))).toBe('--trace-tag: 2ch')
  })

  it('keeps the current mark off the solution row', () => {
    expect(endRow(0, walk(0))).toEqual({ position: 0, tone: 'current', current: true })
    expect(endRow(12, walk(12))).toEqual({ position: 12, tone: 'reached', current: false })
    expect(endRow(12, walk(3))).toMatchObject({ tone: 'future', current: false })
    expect(isSolution(walk(12))).toBe(true)
    expect(isSolution(walk(11))).toBe(false)
  })

  it('counts the steps in words', () => {
    expect(solvedInText(1)).toBe('Solved in 1 step')
    expect(solvedInText(47)).toBe('Solved in 47 steps')
  })

  // The blank sits at position 0 of 0 steps, which isSolution reads as solved.
  it('paints a hidden blank panel that never says solved', () => {
    expect(isSolution(BLANK_WALKTHROUGH)).toBe(true)
    expect(stepsPanel(undefined)).toEqual({
      view: BLANK_WALKTHROUGH,
      hidden: true,
      style: undefined,
      solvedIn: { text: '', hidden: true },
    })
  })

  it('paints a given walkthrough, saying solved only at the solution', () => {
    expect(stepsPanel(walk(12))).toEqual({
      view: walk(12),
      hidden: false,
      style: '--trace-tag: 2ch',
      solvedIn: { text: 'Solved in 12 steps', hidden: false },
    })
    expect(stepsPanel(walk(3)).solvedIn).toEqual({ text: '', hidden: true })
  })

  it('classes a row by its tone', () => {
    expect(rowClass('reached')).toContain('text-solver font-semibold')
  })
})

describe('actionButtons', () => {
  const ids = (mode: typeof INITIAL_VIEW.mode) =>
    actionButtons({ ...INITIAL_VIEW, mode }).map((b) => b.id)

  it('shows the buttons each mode offers', () => {
    expect(ids('playing')).toEqual(['hint-button', 'solve-button', 'clear-button'])
    expect(ids('selecting')).toEqual(['solve-button', 'clear-button'])
    expect(ids('customInput')).toEqual(['start-button', 'clear-button'])
    expect(ids('visualizing')).toEqual(['exit-button', 'clear-button'])
  })

  it('spans clear across the row unless a hint shares it', () => {
    const [, , playingClear] = actionButtons({ ...INITIAL_VIEW, mode: 'playing' })
    const [solve, clear] = actionButtons(INITIAL_VIEW)
    expect(playingClear && actionClass(playingClear)).toBe('w-full')
    expect(clear && actionClass(clear)).toBe('w-full col-span-2')
    expect(solve && actionClass(solve)).toBe('flex-1')
  })

  it('renders every button in one order, hiding those the mode lacks', () => {
    const slots = actionSlots({ ...INITIAL_VIEW, mode: 'customInput' })
    expect(slots.map((slot) => slot.id)).toEqual([
      'hint-button',
      'solve-button',
      'exit-button',
      'start-button',
      'clear-button',
    ])
    expect(slots.filter((slot) => !slot.hidden).map((slot) => slot.id)).toEqual([
      'start-button',
      'clear-button',
    ])
    const playing = actionSlots({ ...INITIAL_VIEW, mode: 'playing' })
    expect(playing.at(-1)?.wide).toBe(false)
    expect(LAYOUT_CLASSES.walkthrough).toContain('grid')
  })

  it('steps New Puzzle back while a custom board is entered', () => {
    expect(newPuzzleVariant(INITIAL_VIEW)).toBe('primary')
    expect(newPuzzleVariant({ ...INITIAL_VIEW, mode: 'customInput' })).toBe('paper')
  })
})

describe('iconHref', () => {
  it('points at the sprite symbol', () => {
    expect(iconHref('x')).toBe('#i-x')
  })
})
