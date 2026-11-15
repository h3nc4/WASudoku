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

/// <reference lib="webworker" />

/** What the build writes into the service worker, with a version that changes on every deploy. */
export interface PrecacheManifest {
  readonly version: string
  /** Paths relative to the worker's scope that hold a hash of their content in the file name. */
  readonly hashed: readonly string[]
  /** The other paths, with `./` standing for the app shell. */
  readonly urls: readonly string[]
}

/** A type alone, since a shared value would split a chunk out of sw.js, which loads as a classic script. */
export interface SkipWaitingMessage {
  readonly type: 'SKIP_WAITING'
}

const CACHE_PREFIX = 'wasudoku-'

/** Precaches the build, reusing earlier copies, and serves it whenever the network cannot. */
export function setUpServiceWorker(sw: ServiceWorkerGlobalScope, manifest: PrecacheManifest) {
  const cacheName = `${CACHE_PREFIX}${manifest.version}`
  const resolve = (url: string) => new URL(url, sw.location.href).href
  const hashed = manifest.hashed.map(resolve)
  const unhashed = manifest.urls.map(resolve)
  const urls = new Set([...hashed, ...unhashed])
  const shell = resolve('./')
  const isEarlier = (name: string) => name.startsWith(CACHE_PREFIX) && name !== cacheName

  async function fromEarlierVersion(url: string, earlier: readonly string[]) {
    for (const name of earlier) {
      const cached = await sw.caches.match(url, { cacheName: name, ignoreVary: true })
      if (cached) return cached
    }
    return undefined
  }

  async function install() {
    const cache = await sw.caches.open(cacheName)
    const earlier = (await sw.caches.keys()).filter(isEarlier)
    await Promise.all([
      ...hashed.map(async (url) => {
        const cached = await fromEarlierVersion(url, earlier)
        // The default cache mode lets the HTTP cache answer for a file the page already loaded.
        return cached ? cache.put(url, cached) : cache.add(url)
      }),
      // A plain name says nothing about its version. The server revalidates each one.
      ...unhashed.map((url) => cache.add(new Request(url, { cache: 'no-cache' }))),
    ])
  }

  sw.addEventListener('install', (event) => {
    event.waitUntil(install())
  })

  sw.addEventListener('activate', (event) => {
    event.waitUntil(
      sw.caches
        .keys()
        .then((names) => Promise.all(names.filter(isEarlier).map((name) => sw.caches.delete(name))))
        .then(() => sw.clients.claim()),
    )
  })

  sw.addEventListener('message', (event) => {
    if ((event.data as Partial<SkipWaitingMessage> | null)?.type === 'SKIP_WAITING') {
      void sw.skipWaiting()
    }
  })

  sw.addEventListener('fetch', (event) => {
    const { request } = event
    if (request.method !== 'GET') return

    // The network answers navigations first, so a reload after a deploy gets the new index.
    if (request.mode === 'navigate') {
      event.respondWith(
        sw.fetch(request).catch(async () => {
          const cached = await sw.caches.match(shell, { cacheName })
          return cached ?? Response.error()
        }),
      )
      return
    }

    if (!urls.has(request.url)) return
    // A module script sends an Origin header the precache request lacked, and Vary would refuse the match.
    event.respondWith(
      sw.caches
        .match(request, { cacheName, ignoreVary: true })
        .then((cached) => cached ?? sw.fetch(request)),
    )
  })
}
