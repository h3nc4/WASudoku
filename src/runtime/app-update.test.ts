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

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyUpdate,
  registerServiceWorker,
  SKIP_WAITING,
  type UpdatePorts,
  watchForUpdates,
} from './app-update'

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

class FakePage extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible'

  show(state: DocumentVisibilityState) {
    this.visibilityState = state
    this.dispatchEvent(new Event('visibilitychange'))
  }
}

const asWorker = (worker: FakeWorker) => worker as unknown as ServiceWorker
const asRegistration = (r: FakeRegistration) => r as unknown as ServiceWorkerRegistration
const asContainer = (c: FakeContainer) => c as unknown as ServiceWorkerContainer
const asPage = (p: FakePage) => p as unknown as Document

describe('applyUpdate', () => {
  it('tells the waiting worker to take over and reloads once it controls the page', () => {
    const worker = new FakeWorker()
    const container = new FakeContainer()
    const reload = vi.fn()

    applyUpdate(asWorker(worker), asContainer(container), reload)

    expect(worker.postMessage).toHaveBeenCalledWith(SKIP_WAITING)
    expect(SKIP_WAITING).toEqual({ type: 'SKIP_WAITING' })
    expect(reload).not.toHaveBeenCalled()
    container.dispatchEvent(new Event('controllerchange'))
    container.dispatchEvent(new Event('controllerchange'))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('watchForUpdates', () => {
  let registration: FakeRegistration
  let container: FakeContainer
  let page: FakePage
  const onUpdate = vi.fn()

  beforeEach(() => {
    registration = new FakeRegistration()
    container = new FakeContainer()
    page = new FakePage()
    onUpdate.mockClear()
  })

  const watch = () => {
    watchForUpdates(asRegistration(registration), asContainer(container), asPage(page), onUpdate)
  }

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
    expect(() => {
      registration.find(null)
    }).not.toThrow()
  })

  it('checks for a new build whenever the page becomes visible again', async () => {
    watch()
    page.show('hidden')
    expect(registration.update).not.toHaveBeenCalled()
    registration.update.mockRejectedValueOnce(new TypeError('offline'))
    page.show('visible')
    expect(registration.update).toHaveBeenCalledTimes(1)
    await Promise.resolve()
  })
})

describe('registerServiceWorker', () => {
  const ports = (container: FakeContainer | undefined) => {
    const reload = vi.fn<() => void>()
    const error = vi.fn<(...data: unknown[]) => void>()
    const value: UpdatePorts = {
      container: container === undefined ? undefined : asContainer(container),
      page: asPage(new FakePage()),
      reload,
      log: { error },
    }
    return { ...value, reload, error }
  }

  it('registers past the HTTP cache and offers a waiting build whose apply reloads into it', async () => {
    const container = new FakeContainer()
    const registration = new FakeRegistration()
    const waiting = new FakeWorker()
    registration.waiting = waiting
    container.register.mockResolvedValue(registration)
    const offer = vi.fn()
    const page = ports(container)

    await registerServiceWorker('/sw.js', page, offer)

    expect(container.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' })
    expect(offer).toHaveBeenCalledTimes(1)
    const [apply] = offer.mock.calls[0] as [() => void]
    apply()
    expect(waiting.postMessage).toHaveBeenCalledWith(SKIP_WAITING)
    container.dispatchEvent(new Event('controllerchange'))
    expect(page.reload).toHaveBeenCalledTimes(1)
  })

  it('logs a failed registration instead of throwing', async () => {
    const container = new FakeContainer()
    const error = new Error('blocked')
    container.register.mockRejectedValue(error)
    const page = ports(container)
    await expect(registerServiceWorker('/sw.js', page, vi.fn())).resolves.toBe(undefined)
    expect(page.error).toHaveBeenCalledWith('Service worker registration failed:', error)
  })

  it('does nothing where the browser offers no service worker', async () => {
    const offer = vi.fn()
    await expect(registerServiceWorker('/sw.js', ports(undefined), offer)).resolves.toBe(undefined)
    expect(offer).not.toHaveBeenCalled()
  })
})
