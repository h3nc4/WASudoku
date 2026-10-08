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

import { createEvent, fireEvent } from '@testing-library/react'

// React listens for the prefixed name only where the platform lacks AnimationEvent, as jsdom does.
const ANIMATION_END = 'AnimationEvent' in globalThis ? 'animationend' : 'webkitAnimationEnd'

/** Fires the animation end event React listens for in this environment. */
export function endAnimation(element: Element) {
  fireEvent(element, new Event(ANIMATION_END, { bubbles: true }))
}

/** Fires a paste of text, since browsers refuse to build one from a plain clipboardData object. */
export function pasteText(element: Element, text: string) {
  const event = createEvent.paste(element)
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } })
  fireEvent(element, event)
}
