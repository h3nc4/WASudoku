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

/** The storage key of the React app, kept so a choice stored then still applies. */
export const THEME_KEY = 'wasudoku-ui-theme'

export type Theme = 'light' | 'dark'

/** The app opens dark whatever the system says, as the React app did. */
export const DEFAULT_THEME: Theme = 'dark'

// Sets the stored theme before first paint, a stored `system` following the OS.
// A page that already sets data-theme, such as a preview, keeps it.
export const THEME_SCRIPT = `(()=>{const r=document.documentElement;if(r.dataset.theme)return;let t=null,d=true;try{t=localStorage.getItem(${JSON.stringify(THEME_KEY)});d=matchMedia('(prefers-color-scheme: dark)').matches}catch{}r.dataset.theme=t==='light'||(t==='system'&&!d)?'light':${JSON.stringify(DEFAULT_THEME)}})()`

/** The CSP source of THEME_SCRIPT, for a `script-src` that doesn't allow inline scripts. */
export const THEME_SCRIPT_HASH = "'sha256-kdF02PEfL7YUBaA+ZF2bmKVaE2RQ4iL2ONhnfGkYvhc='"

export const readTheme = (doc: Document): Theme =>
  doc.documentElement.dataset['theme'] === 'light' ? 'light' : DEFAULT_THEME

const store = (doc: Document, theme: Theme) => {
  try {
    doc.defaultView?.localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Some private windows refuse storage. The theme then applies to this visit only.
  }
}

/** Sets the theme with transitions held off, so no colour fades between the two themes. */
export function applyTheme(doc: Document, theme: Theme): void {
  const root = doc.documentElement
  root.classList.add('theme-switching')
  root.dataset['theme'] = theme
  // Forcing layout settles every colour while transitions are held off, so none start afterwards.
  root.getBoundingClientRect()
  root.classList.remove('theme-switching')
}

export interface ThemeOptions {
  readonly reducedMotion?: () => boolean
}

const prefersReducedMotion = (doc: Document) => (): boolean =>
  doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? true

/** Flips the theme inside a view transition where the engine has one, and stores the choice. */
export function toggleTheme(doc: Document, options: ThemeOptions = {}): Theme {
  const next: Theme = readTheme(doc) === 'dark' ? 'light' : 'dark'
  const reduce = options.reducedMotion ?? prefersReducedMotion(doc)
  store(doc, next)
  if (reduce() || !('startViewTransition' in doc)) applyTheme(doc, next)
  else
    doc.startViewTransition(() => {
      applyTheme(doc, next)
    })
  return next
}

/** Wires the toggle button, and follows a theme chosen in another tab. */
export function bindThemeToggle(button: HTMLElement, options: ThemeOptions = {}): () => void {
  const doc = button.ownerDocument
  const controller = new AbortController()
  const { signal } = controller
  button.addEventListener('click', () => toggleTheme(doc, options), { signal })
  doc.defaultView?.addEventListener(
    'storage',
    (event) => {
      if (event.key === THEME_KEY && (event.newValue === 'light' || event.newValue === 'dark')) {
        applyTheme(doc, event.newValue)
      }
    },
    { signal },
  )
  return () => {
    controller.abort()
  }
}
