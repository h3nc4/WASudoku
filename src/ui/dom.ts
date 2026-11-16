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

/** An element every built page contains, of the class the caller names, or a throw. */
export function required<T extends Element>(
  root: ParentNode,
  selector: string,
  kind: abstract new () => T,
): T {
  const found = root.querySelector(selector)
  if (!(found instanceof kind)) throw new Error(`The page has no ${kind.name} at ${selector}`)
  return found
}

export const all = <T extends Element>(
  root: ParentNode,
  selector: string,
  kind: abstract new () => T,
): T[] => [...root.querySelectorAll(selector)].filter((found): found is T => found instanceof kind)

/** The HTML element an event came from or its nearest ancestor matching `selector`. */
export function closestTo(event: Event, selector: string): HTMLElement | null {
  const found = event.target instanceof Element ? event.target.closest(selector) : null
  return found instanceof HTMLElement ? found : null
}

/** Where `element` sits in `list`, or -1 when it is absent or null. */
export const positionOf = (list: readonly (Element | null)[], element: Element | null): number =>
  list.indexOf(element)

/** Sets or removes an attribute, writing only when the page holds something else. */
export function setAttr(element: Element, name: string, value: string | undefined): void {
  const current = element.getAttribute(name)
  if (value === undefined) {
    if (current !== null) element.removeAttribute(name)
  } else if (current !== value) {
    element.setAttribute(name, value)
  }
}

export const setFlag = (element: Element, name: string, on: boolean): void => {
  setAttr(element, name, on ? '' : undefined)
}

export function setText(element: Node, text: string): void {
  if (element.textContent !== text) element.textContent = text
}

export function setHidden(element: HTMLElement, hidden: boolean): void {
  if (element.hidden !== hidden) element.hidden = hidden
}

/** True when both flat records have equal values under the same keys. */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.is(Reflect.get(a, key), Reflect.get(b, key)))
  )
}

/** Gathers listeners and watchers, and removes them all at once. */
export class Disposer {
  private readonly controller = new AbortController()
  private readonly cleanups: (() => void)[] = []

  get signal(): AbortSignal {
    return this.controller.signal
  }

  add(cleanup: () => void): void {
    this.cleanups.push(cleanup)
  }

  on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
  ): void {
    target.addEventListener(type, listener, { signal: this.signal })
  }

  dispose = (): void => {
    this.controller.abort()
    for (const cleanup of this.cleanups.splice(0)) cleanup()
  }
}
