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

/** How a locale joins a list and picks a plural form. A pt-BR grammar builds both from Intl. */
export interface Grammar {
  /** Items that all hold, "3 and 4". */
  readonly and: (items: readonly string[]) => string
  /** Items of which one holds, "3 or 4". */
  readonly or: (items: readonly string[]) => string
  readonly plural: (count: number) => Intl.LDMLPluralRule
}

// Intl.ListFormat in English adds a serial comma, "1, 2, and 3", which today's text never had.
const joinWords = (items: readonly string[], word: string): string => {
  const last = items.at(-1)
  return items.length <= 1 || last === undefined
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} ${word} ${last}`
}

const ENGLISH_PLURALS = new Intl.PluralRules('en')

export const EN: Grammar = {
  and: (items) => joinWords(items, 'and'),
  or: (items) => joinWords(items, 'or'),
  plural: (count) => ENGLISH_PLURALS.select(count),
}
