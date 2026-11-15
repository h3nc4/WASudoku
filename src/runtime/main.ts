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

import { registerServiceWorker, type UpdateOffer, type UpdatePorts } from './app-update'
import type { RuntimeDeps } from './deps'
import { bindKeyboard } from './keyboard'
import { openedEvent } from './share-link'
import { loadSlices } from './storage'
import { createStore, type Store } from './store'

/** The runtime's ports plus the page it listens on. */
export interface PageDeps extends RuntimeDeps {
  readonly page: Document
  readonly window: Pick<Window, 'addEventListener' | 'removeEventListener'>
}

export interface ServiceWorkerOptions {
  readonly url: string
  readonly ports: UpdatePorts
  readonly offer: UpdateOffer
}

export interface Runtime {
  readonly store: Store
  /** Removes every listener and stops every timer and request. */
  stop(): void
}

/** Starts the store from storage and the address, then binds keys, page hiding and the solver warm-up. */
export function startRuntime(deps: PageDeps, serviceWorker?: ServiceWorkerOptions): Runtime {
  const store = createStore(deps)
  store.dispatch({ type: 'loaded', slices: loadSlices(deps.storage, deps.log) })
  store.dispatch(openedEvent(deps.location))
  const unbindKeys = bindKeyboard(deps.page, store)

  const hide = (): void => {
    store.dispatch({ type: 'hidden' })
  }
  const onVisibility = (): void => {
    if (deps.page.visibilityState === 'hidden') hide()
  }
  deps.window.addEventListener('pagehide', hide)
  deps.page.addEventListener('visibilitychange', onVisibility)

  // Idle callbacks run after a frame, so the wasm compile never delays the first paint.
  const cancelWarm = deps.timers.idle(() => {
    deps.solver.warm()
  })
  if (serviceWorker !== undefined) {
    void registerServiceWorker(serviceWorker.url, serviceWorker.ports, serviceWorker.offer)
  }

  return {
    store,
    stop() {
      unbindKeys()
      deps.window.removeEventListener('pagehide', hide)
      deps.page.removeEventListener('visibilitychange', onVisibility)
      cancelWarm()
      store.dispose()
    },
  }
}
