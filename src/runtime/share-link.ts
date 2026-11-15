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

import type { SystemEvent, UserEvent } from '../core/game/events'

/** The page's address, as `location` gives it. */
export interface Address {
  readonly search: string
  readonly href: string
}

/** The startup event that offers a puzzle from a `?p=` link. The core strips it from the address. */
export const openedEvent = ({ search, href }: Address): SystemEvent => ({
  type: 'opened',
  search,
  href,
})

/** Copies a link to the puzzle on the address the page is served from, wherever that is. */
export const shareEvent = ({ href }: Address): UserEvent => ({ type: 'share', href })
