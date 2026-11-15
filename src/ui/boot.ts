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

import { isDifficulty } from '../core/game/selectors'
import type { AddressBar } from '../runtime/deps'
import type { Address } from '../runtime/share-link'
import type { Store } from '../runtime/store'

/** The query a home screen shortcut opens, such as `/?new=easy` from the web manifest. */
export const NEW_PARAM = 'new'

/** Starts the puzzle in a `?new=` query and drops the query. A reload then resumes that game. */
export function startFromQuery(address: Address, history: AddressBar, store: Store): void {
  const url = new URL(address.href)
  const difficulty = url.searchParams.get(NEW_PARAM)
  if (difficulty === null) return
  url.searchParams.delete(NEW_PARAM)
  history.replaceState(history.state, '', url.href)
  if (isDifficulty(difficulty)) store.dispatch({ type: 'newGame', difficulty })
}
