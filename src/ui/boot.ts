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
import type { GameEvent } from './dialogs'

/** The query a home screen shortcut opens, such as `/?new=easy` from the web manifest. */
export const NEW_PARAM = 'new'

/** Starts a `?new=` puzzle through `startOver` and drops the query, so a reload resumes it. */
export function startFromQuery(
  address: Address,
  history: AddressBar,
  startOver: (event: GameEvent) => void,
): void {
  const url = new URL(address.href)
  const difficulty = url.searchParams.get(NEW_PARAM)
  if (difficulty === null) return
  url.searchParams.delete(NEW_PARAM)
  history.replaceState(history.state, '', url.href)
  if (isDifficulty(difficulty)) startOver({ type: 'newGame', difficulty })
}
