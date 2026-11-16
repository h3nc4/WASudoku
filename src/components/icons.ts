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

/** The symbols in src/assets/icons/sprite.svg. */
export type IconName =
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'eraser'
  | 'eye'
  | 'github'
  | 'keyboard'
  | 'lightbulb'
  | 'link'
  | 'loader-circle'
  | 'lock'
  | 'lock-open'
  | 'moon'
  | 'party-popper'
  | 'pause'
  | 'pen-line'
  | 'pencil'
  | 'play'
  | 'redo'
  | 'share-2'
  | 'sun'
  | 'toast-error'
  | 'toast-info'
  | 'toast-success'
  | 'type'
  | 'undo'
  | 'wand-sparkles'
  | 'x'

export const iconHref = (name: IconName): string => `#i-${name}`
