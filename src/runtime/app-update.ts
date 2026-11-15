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

import type { Logger } from './deps'

/** The message the service worker takes as leave to activate, as `src/workers/precache.ts` reads it. */
export const SKIP_WAITING = { type: 'SKIP_WAITING' } as const

/** Shows the update offer. Calling `apply` activates the new build and reloads into it. */
export type UpdateOffer = (apply: () => void) => void

type Container = Pick<ServiceWorkerContainer, 'addEventListener' | 'controller' | 'register'>
type Page = Pick<Document, 'addEventListener' | 'visibilityState'>

export interface UpdatePorts {
  /** Undefined outside a secure context. */
  readonly container: Container | undefined
  readonly page: Page
  readonly reload: () => void
  readonly log: Logger
}

/** Activates the waiting worker and reloads once it controls the page. */
export function applyUpdate(worker: ServiceWorker, container: Container, reload: () => void): void {
  container.addEventListener(
    'controllerchange',
    () => {
      reload()
    },
    { once: true },
  )
  worker.postMessage(SKIP_WAITING)
}

/** Calls `onUpdate` for a new worker that waits behind the one controlling the page. */
export function watchForUpdates(
  registration: ServiceWorkerRegistration,
  container: Container,
  page: Page,
  onUpdate: (worker: ServiceWorker) => void,
): void {
  // Without a controller this is the first install, and an offer would be noise.
  if (registration.waiting !== null && container.controller !== null) onUpdate(registration.waiting)

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing
    // Read now, since WebKit has already claimed the page by the time it reports installed.
    const isUpdate = container.controller !== null
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && isUpdate) onUpdate(worker)
    })
  })

  // An installed app can run for days, so it checks again whenever it comes back.
  page.addEventListener('visibilitychange', () => {
    if (page.visibilityState === 'visible') registration.update().catch(() => undefined)
  })
}

/** Registers the service worker past the HTTP cache and offers each later build once it waits. */
export async function registerServiceWorker(
  url: string,
  ports: UpdatePorts,
  offer: UpdateOffer,
): Promise<void> {
  const { container, page, reload, log } = ports
  if (container === undefined) return
  try {
    const registration = await container.register(url, { updateViaCache: 'none' })
    watchForUpdates(registration, container, page, (worker) => {
      offer(() => {
        applyUpdate(worker, container, reload)
      })
    })
  } catch (error) {
    log.error('Service worker registration failed:', error)
  }
}
