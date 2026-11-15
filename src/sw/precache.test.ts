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

import { assetPaths, setUpServiceWorker } from './precache'

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
  const cache = {
    add: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
  }
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue(['wasudoku-v0', 'wasudoku-v1', CURRENT, 'other-app']),
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
    hashed: ['assets/index-abc.js', 'assets/font-def.woff2'],
    urls: ['./', 'sudoku.wasm'],
    assetsDir: 'assets',
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

  /** Earlier caches holding the given paths, as `caches.match` with a cacheName finds them. */
  function holdInEarlierCaches(entries: Partial<Record<string, string[]>>) {
    sw.caches.match.mockImplementation((url: string, { cacheName }: { cacheName: string }) =>
      Promise.resolve(
        entries[cacheName]?.includes(new URL(url).pathname)
          ? new Response(`${cacheName}${url}`)
          : undefined,
      ),
    )
  }

  /** A shell naming only assets this build precaches, as the server answers the install with. */
  const SHELL_HTML =
    '<script type="module" src="/assets/index-abc.js"></script><style>url(./assets/font-def.woff2)</style>'

  function serveShell(html: string, status = 200) {
    sw.scope.fetch.mockImplementation(() => Promise.resolve(new Response(html, { status })))
  }

  async function install() {
    const event = sw.dispatch('install', createEvent())
    await event.pending()
    return event
  }

  /** The shell request the install sent, which must ask the server and not the HTTP cache. */
  const shellRequest = () => {
    const [entry] = sw.scope.fetch.mock.calls[0] as [Request]
    return entry
  }

  it('fetches a hashed file through the HTTP cache when no earlier version holds it', async () => {
    holdInEarlierCaches({})
    serveShell(SHELL_HTML)
    await install()

    expect(sw.caches.open).toHaveBeenCalledWith(CURRENT)
    expect(sw.cache.add).toHaveBeenCalledWith(`${ORIGIN}/assets/index-abc.js`)
    expect(sw.cache.add).toHaveBeenCalledWith(`${ORIGIN}/assets/font-def.woff2`)
    expect(sw.cache.put).not.toHaveBeenCalledWith(
      expect.stringContaining('/assets/'),
      expect.anything(),
    )
  })

  it('revalidates every unhashed file with the server', async () => {
    holdInEarlierCaches({})
    serveShell(SHELL_HTML)
    await install()

    const requests = sw.cache.add.mock.calls
      .map(([entry]) => entry as unknown)
      .filter((entry): entry is Request => entry instanceof Request)
    expect(requests.map((r) => [r.url, r.cache])).toEqual([[`${ORIGIN}/sudoku.wasm`, 'no-cache']])
    expect([shellRequest().url, shellRequest().cache]).toEqual([`${ORIGIN}/`, 'no-cache'])
  })

  it('caches a shell that names only assets of its own build', async () => {
    holdInEarlierCaches({})
    serveShell(SHELL_HTML)
    await install()

    const [url, response] = sw.cache.put.mock.calls[0] as [string, Response]
    expect(url).toBe(`${ORIGIN}/`)
    await expect(response.text()).resolves.toBe(SHELL_HTML)
  })

  it('fails the install when the shell names an asset of another deploy', async () => {
    holdInEarlierCaches({})
    serveShell(SHELL_HTML.replace('index-abc.js', 'index-next.js'))

    const event = sw.dispatch('install', createEvent())

    await expect(event.pending()).rejects.toThrow(`${ORIGIN}/assets/index-next.js`)
    expect(sw.cache.put).not.toHaveBeenCalledWith(`${ORIGIN}/`, expect.anything())
  })

  it('fails the install when the shell does not answer with success', async () => {
    holdInEarlierCaches({})
    serveShell('busy', 503)

    const event = sw.dispatch('install', createEvent())

    await expect(event.pending()).rejects.toThrow('503')
    expect(sw.cache.put).not.toHaveBeenCalled()
  })

  it('copies a hashed file an earlier version cached instead of fetching it', async () => {
    holdInEarlierCaches({ 'wasudoku-v1': ['/assets/index-abc.js'] })
    serveShell(SHELL_HTML)
    await install()

    const copies = sw.cache.put.mock.calls.filter(([url]) => url !== `${ORIGIN}/`)
    expect(copies).toHaveLength(1)
    const [url, response] = copies[0] as [string, Response]
    expect(url).toBe(`${ORIGIN}/assets/index-abc.js`)
    await expect(response.text()).resolves.toBe(`wasudoku-v1${ORIGIN}/assets/index-abc.js`)
    expect(sw.cache.add).not.toHaveBeenCalledWith(`${ORIGIN}/assets/index-abc.js`)
    expect(sw.cache.add).toHaveBeenCalledWith(`${ORIGIN}/assets/font-def.woff2`)
  })

  it('stops at the first earlier version holding a file and never reads another cache', async () => {
    holdInEarlierCaches({ 'wasudoku-v0': ['/assets/font-def.woff2'] })
    serveShell(SHELL_HTML)
    await install()

    const searched = (path: string) =>
      sw.caches.match.mock.calls
        .filter(([url]) => url === `${ORIGIN}${path}`)
        .map(([, options]) => (options as { cacheName: string }).cacheName)
    expect(searched('/assets/font-def.woff2')).toEqual(['wasudoku-v0'])
    expect(searched('/assets/index-abc.js')).toEqual(['wasudoku-v0', 'wasudoku-v1'])
  })

  it('fails the install when a file cannot be cached', async () => {
    holdInEarlierCaches({})
    serveShell(SHELL_HTML)
    sw.cache.add.mockRejectedValueOnce(new TypeError('offline'))

    const event = sw.dispatch('install', createEvent())

    await expect(event.pending()).rejects.toThrow('offline')
  })

  it('deletes caches of earlier builds and leaves other caches alone on activate', async () => {
    const event = sw.dispatch('activate', createEvent())
    await event.pending()

    expect(sw.caches.delete).toHaveBeenCalledTimes(2)
    expect(sw.caches.delete).toHaveBeenCalledWith('wasudoku-v0')
    expect(sw.caches.delete).toHaveBeenCalledWith('wasudoku-v1')
    expect(sw.scope.clients.claim).toHaveBeenCalled()
  })

  it.each([
    [{ type: 'SKIP_WAITING' }, 1],
    [{ type: 'OTHER' }, 0],
    [{}, 0],
    ['SKIP_WAITING', 0],
    [null, 0],
  ])('skips waiting only when asked, for message %j', (data, calls) => {
    sw.dispatch('message', createEvent({ data }))
    expect(sw.scope.skipWaiting).toHaveBeenCalledTimes(calls)
  })

  it.each(['/', '/?p=123', '/?new=easy#top', '/index.html'])(
    'serves the shell for a navigation to %s from the cache, never asking the network',
    async (path) => {
      const shell = new Response('shell')
      sw.caches.match.mockResolvedValue(shell)

      const event = sw.dispatch(
        'fetch',
        createEvent({ request: request(path, { mode: 'navigate' }) }),
      )

      await expect(event.pending()).resolves.toBe(shell)
      expect(sw.caches.match).toHaveBeenCalledWith(`${ORIGIN}/`, { cacheName: CURRENT })
      expect(sw.scope.fetch).not.toHaveBeenCalled()
    },
  )

  it('fetches the shell when the cache lost it', async () => {
    const response = new Response('fresh')
    sw.caches.match.mockResolvedValue(undefined)
    sw.scope.fetch.mockResolvedValue(response)
    const shell = request('/', { mode: 'navigate' })

    const event = sw.dispatch('fetch', createEvent({ request: shell }))

    await expect(event.pending()).resolves.toBe(response)
    expect(sw.scope.fetch).toHaveBeenCalledWith(shell)
  })

  it('sends a navigation to any other path to the network while it answers', async () => {
    const response = new Response('not found', { status: 404 })
    sw.scope.fetch.mockResolvedValue(response)

    const event = sw.dispatch(
      'fetch',
      createEvent({ request: request('/no-such-page', { mode: 'navigate' }) }),
    )

    await expect(event.pending()).resolves.toBe(response)
    expect(sw.caches.match).not.toHaveBeenCalled()
  })

  it('falls back to the cached shell for any other path once the network fails', async () => {
    const shell = new Response('shell')
    sw.scope.fetch.mockRejectedValue(new TypeError('offline'))
    sw.caches.match.mockResolvedValue(shell)

    const event = sw.dispatch(
      'fetch',
      createEvent({ request: request('/deep/path', { mode: 'navigate' }) }),
    )

    await expect(event.pending()).resolves.toBe(shell)
    expect(sw.caches.match).toHaveBeenCalledWith(`${ORIGIN}/`, { cacheName: CURRENT })
  })

  it('answers another path with a network error when offline and nothing was cached', async () => {
    sw.scope.fetch.mockRejectedValue(new TypeError('offline'))
    sw.caches.match.mockResolvedValue(undefined)

    const event = sw.dispatch(
      'fetch',
      createEvent({ request: request('/deep/path', { mode: 'navigate' }) }),
    )

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

describe('assetPaths', () => {
  it('finds each asset a page names once, however the URL is spelled', () => {
    const html = [
      '<script src="/assets/a.1.js"></script>',
      '<link href=./assets/b.2.woff2>',
      '<style>@font-face{src:url(assets/c.3.woff2)}</style>',
      "<img src='/assets/a.1.js'>",
    ].join('')
    expect(assetPaths(html, 'assets')).toEqual([
      'assets/a.1.js',
      'assets/b.2.woff2',
      'assets/c.3.woff2',
    ])
  })

  it('ignores a name that only contains the directory and escapes it as a literal', () => {
    expect(assetPaths('<a href="/myassets/x.js">assets</a>', 'assets')).toEqual([])
    expect(assetPaths('<script src="/a.b/x.js"></script><p src="/aXb/y.js">', 'a.b')).toEqual([
      'a.b/x.js',
    ])
  })
})
