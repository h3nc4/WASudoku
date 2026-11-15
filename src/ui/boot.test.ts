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

import { harness } from '../test/app-page'
import { startFromQuery } from './boot'

const bar = () => ({ state: { kept: true }, replaceState: vi.fn() })

describe('startFromQuery', () => {
  it('starts the shortcut puzzle and drops only its own parameter', () => {
    const test = harness()
    const history = bar()
    startFromQuery(
      { search: '?new=hard&x=1', href: 'https://w/?new=hard&x=1#top' },
      history,
      test.store,
    )
    expect(test.state().pending).toMatchObject({ task: 'generate', difficulty: 'hard' })
    expect(history.replaceState).toHaveBeenCalledWith({ kept: true }, '', 'https://w/?x=1#top')
  })

  it('drops a difficulty it does not know, and leaves a plain address alone', () => {
    const test = harness()
    const history = bar()
    startFromQuery({ search: '?new=nope', href: 'https://w/?new=nope' }, history, test.store)
    expect(test.state().pending).toBeNull()
    expect(history.replaceState).toHaveBeenCalledWith({ kept: true }, '', 'https://w/')
    history.replaceState.mockClear()
    startFromQuery({ search: '', href: 'https://w/' }, history, test.store)
    expect(history.replaceState).not.toHaveBeenCalled()
  })
})
