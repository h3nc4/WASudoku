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

import { toast } from 'sonner'

import type { SkipWaitingMessage } from '@/workers/precache'

const UPDATE_TOAST_ID = 'app-update'

/** Activates the waiting worker and reloads once it controls the page. */
export function applyUpdate(
  worker: ServiceWorker,
  container: ServiceWorkerContainer = navigator.serviceWorker,
  reload: () => void = () => globalThis.location.reload(),
) {
  container.addEventListener('controllerchange', () => reload(), { once: true })
  worker.postMessage({ type: 'SKIP_WAITING' } satisfies SkipWaitingMessage)
}

export function promptForUpdate(worker: ServiceWorker) {
  toast('Update available', {
    id: UPDATE_TOAST_ID,
    duration: Infinity,
    action: { label: 'Reload', onClick: () => applyUpdate(worker) },
  })
}

/** Calls onUpdate for a new worker that is waiting behind the one controlling the page. */
export function watchForUpdates(
  registration: ServiceWorkerRegistration,
  container: ServiceWorkerContainer,
  onUpdate: (worker: ServiceWorker) => void,
) {
  // Without a controller this is the first install, and a prompt would be noise.
  if (registration.waiting && container.controller) onUpdate(registration.waiting)

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing
    // Read now, since WebKit has already claimed the page by the time it reports installed.
    const isUpdate = container.controller !== null
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && isUpdate) onUpdate(worker)
    })
  })

  // An installed app can run for days, so it checks again whenever it comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registration.update().catch(() => undefined)
  })
}

export async function registerServiceWorker(
  url: string,
  onUpdate: (worker: ServiceWorker) => void = promptForUpdate,
  container: ServiceWorkerContainer | undefined = navigator.serviceWorker,
) {
  // Browsers leave the container undefined outside a secure context.
  if (!container) return
  try {
    const registration = await container.register(url, { updateViaCache: 'none' })
    watchForUpdates(registration, container, onUpdate)
  } catch (error) {
    console.error('Service worker registration failed:', error)
  }
}
