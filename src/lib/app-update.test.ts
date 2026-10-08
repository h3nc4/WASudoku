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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applyUpdate, promptForUpdate, registerServiceWorker, watchForUpdates } from './app-update'

vi.mock('sonner', () => ({ toast: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
})

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = 'installing'
  postMessage = vi.fn()

  install() {
    this.state = 'installed'
    this.dispatchEvent(new Event('statechange'))
  }
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null
  installing: FakeWorker | null = null
  update = vi.fn().mockResolvedValue(undefined)

  find(worker: FakeWorker | null) {
    this.installing = worker
    this.dispatchEvent(new Event('updatefound'))
  }
}

class FakeContainer extends EventTarget {
  controller: object | null = {}
  register = vi.fn()
}

const asWorker = (worker: FakeWorker) => worker as unknown as ServiceWorker
const asRegistration = (r: FakeRegistration) => r as unknown as ServiceWorkerRegistration
const asContainer = (c: FakeContainer) => c as unknown as ServiceWorkerContainer

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('applyUpdate', () => {
  it('tells the waiting worker to take over and reloads once it controls the page', () => {
    const worker = new FakeWorker()
    const container = new FakeContainer()
    const reload = vi.fn()

    applyUpdate(asWorker(worker), asContainer(container), reload)

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(reload).not.toHaveBeenCalled()
    container.dispatchEvent(new Event('controllerchange'))
    container.dispatchEvent(new Event('controllerchange'))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('defaults to the page container and a page reload', () => {
    const container = new FakeContainer()
    const reload = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker: container })
    vi.stubGlobal('location', { reload })

    applyUpdate(asWorker(new FakeWorker()))
    container.dispatchEvent(new Event('controllerchange'))

    expect(reload).toHaveBeenCalled()
  })
})

describe('promptForUpdate', () => {
  it('shows one lasting toast whose Reload action applies the update', () => {
    const worker = new FakeWorker()
    vi.stubGlobal('navigator', { serviceWorker: new FakeContainer() })

    promptForUpdate(asWorker(worker))

    expect(toast).toHaveBeenCalledWith('Update available', {
      id: 'app-update',
      duration: Infinity,
      action: { label: 'Reload', onClick: expect.any(Function) },
    })
    const { action } = vi.mocked(toast).mock.calls[0][1] as {
      action: { onClick: (event?: unknown) => void }
    }
    action.onClick()
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })
})

describe('watchForUpdates', () => {
  let registration: FakeRegistration
  let container: FakeContainer
  const onUpdate = vi.fn()

  beforeEach(() => {
    registration = new FakeRegistration()
    container = new FakeContainer()
    onUpdate.mockClear()
  })

  afterEach(() => {
    setVisibility('visible')
  })

  const watch = () =>
    watchForUpdates(asRegistration(registration), asContainer(container), onUpdate)

  it('offers a worker already waiting when the page loads', () => {
    registration.waiting = new FakeWorker()
    watch()
    expect(onUpdate).toHaveBeenCalledWith(registration.waiting)
  })

  it('offers a new worker once it has installed', () => {
    watch()
    const worker = new FakeWorker()
    registration.find(worker)
    expect(onUpdate).not.toHaveBeenCalled()

    worker.install()
    expect(onUpdate).toHaveBeenCalledWith(worker)
  })

  it('ignores state changes other than installed', () => {
    watch()
    const worker = new FakeWorker()
    registration.find(worker)
    worker.state = 'redundant'
    worker.dispatchEvent(new Event('statechange'))
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('stays quiet on the first install, when no worker controls the page yet', () => {
    container.controller = null
    registration.waiting = new FakeWorker()
    watch()
    const worker = new FakeWorker()
    registration.find(worker)
    worker.install()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('stays quiet when the first install claims the page before it reports installed', () => {
    container.controller = null
    watch()
    const worker = new FakeWorker()
    registration.find(worker)
    container.controller = {}
    worker.install()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('tolerates an update found without an installing worker', () => {
    watch()
    expect(() => registration.find(null)).not.toThrow()
  })

  it('checks for a new build whenever the page becomes visible again', async () => {
    watch()
    setVisibility('hidden')
    expect(registration.update).not.toHaveBeenCalled()

    registration.update.mockRejectedValueOnce(new TypeError('offline'))
    setVisibility('visible')
    expect(registration.update).toHaveBeenCalledTimes(1)
    await Promise.resolve()
  })
})

describe('registerServiceWorker', () => {
  it('registers the worker without the HTTP cache and watches it for updates', async () => {
    const container = new FakeContainer()
    const registration = new FakeRegistration()
    registration.waiting = new FakeWorker()
    container.register.mockResolvedValue(registration)
    const onUpdate = vi.fn()

    await registerServiceWorker('/sw.js', onUpdate, asContainer(container))

    expect(container.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' })
    expect(onUpdate).toHaveBeenCalledWith(registration.waiting)
  })

  it('logs a failed registration instead of throwing', async () => {
    const container = new FakeContainer()
    const error = new Error('blocked')
    container.register.mockRejectedValue(error)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(registerServiceWorker('/sw.js', vi.fn(), asContainer(container))).resolves.toBe(
      undefined,
    )
    expect(consoleError).toHaveBeenCalledWith('Service worker registration failed:', error)
    consoleError.mockRestore()
  })

  it('does nothing where the browser offers no service worker', async () => {
    vi.stubGlobal('navigator', {})
    await expect(registerServiceWorker('/sw.js')).resolves.toBe(undefined)
  })
})
