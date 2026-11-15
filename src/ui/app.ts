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

import type { UpdatePorts } from '../runtime/app-update'
import { browserDeps } from '../runtime/browser'
import type { AddressBar } from '../runtime/deps'
import { type Runtime, startRuntime } from '../runtime/main'
import type { Address } from '../runtime/share-link'
import type { Store } from '../runtime/store'
import { startFromQuery } from './boot'
import { bindControls } from './controls'
import { bindDialogs } from './dialogs'
import { all, Disposer, required } from './dom'
import { bindBoard } from './grid'
import { bindAnnouncer, bindHint } from './hint'
import { bindLayout } from './layout'
import { bindMenus } from './menus'
import { bindPad } from './pad'
import { bindStatus } from './status'
import { bindThemeToggle } from './theme'
import { createToaster, type Toaster } from './toast'
import { notifier, toastSink, updateOffer } from './toaster'
import { bindWalkthrough } from './walkthrough'

/** Where the build writes the service worker, whose scope is the whole site. */
export const SERVICE_WORKER_URL = '/sw.js'

/** Controls pressed with a pointer leave focus on the cell, so the selection they act on stays. */
const KEEP_FOCUS = ['#number-pad', '#control-row', '#action-row', '#input-mode', '#hint-slot']

export interface AppPorts {
  readonly toaster: Toaster
  readonly address: Address
  readonly history: AddressBar
}

/** Binds every widget on the page to the store, and returns the function that unbinds them. */
export function mountApp(doc: Document, store: Store, ports: AppPorts): () => void {
  const { toaster } = ports
  const disposer = new Disposer()
  const dialogs = bindDialogs(doc, store, toaster.raise)
  const notify = notifier(toaster, () => {
    store.dispatch({ type: 'undo' })
  })
  disposer.add(dialogs.dispose)
  disposer.add(bindLayout(doc, store))
  disposer.add(bindBoard(doc, store))
  disposer.add(bindPad(doc, store))
  disposer.add(bindStatus(doc, store))
  disposer.add(bindControls(doc, store, { confirmReveal: dialogs.confirmReveal, notify }))
  disposer.add(bindHint(doc, store))
  disposer.add(bindAnnouncer(doc, store))
  disposer.add(bindWalkthrough(doc, store))
  disposer.add(bindMenus(doc, store, ports.address, dialogs.startOver))
  disposer.add(bindThemeToggle(required(doc, '#theme-button', HTMLElement)))
  for (const area of KEEP_FOCUS.flatMap((selector) => all(doc, selector, HTMLElement))) {
    disposer.on(area, 'mousedown', (event) => {
      event.preventDefault()
    })
  }
  // After the bindings, so a shortcut over a game in progress opens the abandon dialog.
  startFromQuery(ports.address, ports.history, dialogs.startOver)
  return disposer.dispose
}

type Scope = Window & typeof globalThis

/** The service worker's ports on a page, undefined outside a secure context. */
export const updatePorts = (
  scope: Pick<Scope, 'navigator' | 'document' | 'location' | 'console'>,
): UpdatePorts => ({
  container: 'serviceWorker' in scope.navigator ? scope.navigator.serviceWorker : undefined,
  page: scope.document,
  reload: () => {
    scope.location.reload()
  },
  log: scope.console,
})

/** Starts the runtime on a real page and binds the page to it. */
export function startApp(scope: Scope, solver?: Parameters<typeof browserDeps>[2]): () => void {
  const doc = scope.document
  const toaster = createToaster(required(doc, '#toasts', HTMLElement))
  const runtime: Runtime = startRuntime(browserDeps(scope, toastSink(toaster), solver), {
    url: SERVICE_WORKER_URL,
    ports: updatePorts(scope),
    offer: updateOffer(toaster),
  })
  const unmount = mountApp(doc, runtime.store, {
    toaster,
    address: scope.location,
    history: scope.history,
  })
  return () => {
    unmount()
    runtime.stop()
    toaster.dispose()
  }
}
