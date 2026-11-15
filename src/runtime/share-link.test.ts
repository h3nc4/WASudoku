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

import { describe, expect, it } from 'vitest'

import { openedEvent, shareEvent } from './share-link'

describe('share links', () => {
  const address = { search: '?p=1', href: 'https://example.org/app/?p=1#x' }

  it('opens with the query and the full address', () => {
    expect(openedEvent(address)).toEqual({ type: 'opened', search: '?p=1', href: address.href })
  })

  it('shares from the address the page is on', () => {
    expect(shareEvent(address)).toEqual({ type: 'share', href: address.href })
  })
})
