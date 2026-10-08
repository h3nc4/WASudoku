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

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setUpServiceWorker } from './precache'

const ORIGIN = 'https://wasudoku.test'
const CURRENT = 'wasudoku-v2'

type Handler = (event: unknown) => void

interface FakeEvent {
  waitUntil: ReturnType<typeof vi.fn>
  respondWith: ReturnType<typeof vi.fn>
  pending: () => Promise<unknown>
}

function createEvent(extra: object = {}): FakeEvent & Record<string, unknown> {
  let pending: Promise<unknown> | undefined
  const hold = (promise: Promise<unknown>) => {
    pending = promise
  }
  return {
    waitUntil: vi.fn(hold),
    respondWith: vi.fn(hold),
    pending: () => pending ?? Promise.resolve(undefined),
    ...extra,
  }
}

function createScope() {
  const handlers = new Map<string, Handler>()
  const cache = { addAll: vi.fn().mockResolvedValue(undefined) }
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue(['wasudoku-v1', CURRENT, 'other-app']),
    delete: vi.fn().mockResolvedValue(true),
    match: vi.fn(),
  }
  const scope = {
    location: new URL(`${ORIGIN}/sw.js`),
    caches,
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
    fetch: vi.fn(),
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
  }
  setUpServiceWorker(scope as unknown as ServiceWorkerGlobalScope, {
    version: 'v2',
    urls: ['./', 'assets/index-abc.js', 'sudoku.wasm'],
  })
  const dispatch = (type: string, event: FakeEvent) => {
    handlers.get(type)?.(event)
    return event
  }
  return { scope, cache, caches, dispatch }
}

const request = (path: string, init: { method?: string; mode?: RequestMode } = {}) => ({
  url: `${ORIGIN}${path}`,
  method: init.method ?? 'GET',
  mode: init.mode ?? 'cors',
})

describe('setUpServiceWorker', () => {
  let sw: ReturnType<typeof createScope>

  beforeEach(() => {
    sw = createScope()
  })

  it('precaches every listed file into the cache named for this build, bypassing the HTTP cache', async () => {
    const event = sw.dispatch('install', createEvent())
    await event.pending()

    expect(sw.caches.open).toHaveBeenCalledWith(CURRENT)
    const requests = sw.cache.addAll.mock.calls[0][0] as Request[]
    expect(requests.map((r) => r.url)).toEqual([
      `${ORIGIN}/`,
      `${ORIGIN}/assets/index-abc.js`,
      `${ORIGIN}/sudoku.wasm`,
    ])
    expect(requests.every((r) => r.cache === 'reload')).toBe(true)
  })

  it('deletes caches of earlier builds and leaves other caches alone on activate', async () => {
    const event = sw.dispatch('activate', createEvent())
    await event.pending()

    expect(sw.caches.delete).toHaveBeenCalledTimes(1)
    expect(sw.caches.delete).toHaveBeenCalledWith('wasudoku-v1')
    expect(sw.scope.clients.claim).toHaveBeenCalled()
  })

  it.each([
    [{ type: 'SKIP_WAITING' }, 1],
    [{ type: 'OTHER' }, 0],
    [null, 0],
  ])('skips waiting only when asked, for message %j', (data, calls) => {
    sw.dispatch('message', createEvent({ data }))
    expect(sw.scope.skipWaiting).toHaveBeenCalledTimes(calls)
  })

  it('serves a navigation from the network while it answers', async () => {
    const response = new Response('fresh')
    sw.scope.fetch.mockResolvedValue(response)

    const event = sw.dispatch('fetch', createEvent({ request: request('/', { mode: 'navigate' }) }))

    await expect(event.pending()).resolves.toBe(response)
    expect(sw.caches.match).not.toHaveBeenCalled()
  })

  it('falls back to the cached shell for any navigation once the network fails', async () => {
    const shell = new Response('shell')
    sw.scope.fetch.mockRejectedValue(new TypeError('offline'))
    sw.caches.match.mockResolvedValue(shell)

    const event = sw.dispatch(
      'fetch',
      createEvent({ request: request('/?puzzle=123', { mode: 'navigate' }) }),
    )

    await expect(event.pending()).resolves.toBe(shell)
    expect(sw.caches.match).toHaveBeenCalledWith(`${ORIGIN}/`, { cacheName: CURRENT })
  })

  it('answers a navigation with a network error when nothing was cached', async () => {
    sw.scope.fetch.mockRejectedValue(new TypeError('offline'))
    sw.caches.match.mockResolvedValue(undefined)

    const event = sw.dispatch('fetch', createEvent({ request: request('/', { mode: 'navigate' }) }))

    const response = (await event.pending()) as Response
    expect(response.type).toBe('error')
  })

  it('serves a precached file from the cache', async () => {
    const cached = new Response('code')
    sw.caches.match.mockResolvedValue(cached)
    const asset = request('/assets/index-abc.js')

    const event = sw.dispatch('fetch', createEvent({ request: asset }))

    await expect(event.pending()).resolves.toBe(cached)
    expect(sw.caches.match).toHaveBeenCalledWith(asset, { cacheName: CURRENT, ignoreVary: true })
    expect(sw.scope.fetch).not.toHaveBeenCalled()
  })

  it('fetches a precached file the cache lost', async () => {
    const response = new Response('code')
    sw.caches.match.mockResolvedValue(undefined)
    sw.scope.fetch.mockResolvedValue(response)
    const asset = request('/sudoku.wasm')

    const event = sw.dispatch('fetch', createEvent({ request: asset }))

    await expect(event.pending()).resolves.toBe(response)
    expect(sw.scope.fetch).toHaveBeenCalledWith(asset)
  })

  it.each([
    ['a file outside the build', request('/wasudoku-preview.png')],
    ['a request other than GET', request('/', { method: 'POST', mode: 'navigate' })],
    ['a request to another origin', { ...request('/'), url: 'https://elsewhere.test/' }],
  ])('leaves %s to the browser', (_, req) => {
    const event = sw.dispatch('fetch', createEvent({ request: req }))
    expect(event.respondWith).not.toHaveBeenCalled()
  })
})
