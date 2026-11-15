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

/// <reference lib="webworker" />

import type { PrecacheManifest } from './precache-manifest'

/** Asks a waiting worker to take over, which the page sends once the user accepts an update. */
export interface SkipWaitingMessage {
  readonly type: 'SKIP_WAITING'
}

const CACHE_PREFIX = 'wasudoku-'
const SKIP_WAITING: SkipWaitingMessage['type'] = 'SKIP_WAITING'

const isSkipWaiting = (data: unknown): boolean =>
  typeof data === 'object' && data !== null && 'type' in data && data.type === SKIP_WAITING

/** Precaches the build, reusing earlier copies, and serves the shell cache-first. */
export function setUpServiceWorker(sw: ServiceWorkerGlobalScope, manifest: PrecacheManifest): void {
  const cacheName = `${CACHE_PREFIX}${manifest.version}`
  const resolve = (url: string) => new URL(url, sw.location.href).href
  const hashed = manifest.hashed.map(resolve)
  const unhashed = manifest.urls.map(resolve)
  const urls = new Set([...hashed, ...unhashed])
  const shell = resolve('./')
  const shellPaths = new Set([shell, resolve('index.html')])
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

  async function activate() {
    const names = await sw.caches.keys()
    await Promise.all(names.filter(isEarlier).map((name) => sw.caches.delete(name)))
    await sw.clients.claim()
  }

  /** The shell this version cached, so the page and its hashed assets never mix two deploys. */
  async function openShell(request: Request) {
    return (await sw.caches.match(shell, { cacheName })) ?? sw.fetch(request)
  }

  /** The network answers any other path with 404.html. Offline, the shell answers instead. */
  async function openPage(request: Request) {
    try {
      return await sw.fetch(request)
    } catch {
      return (await sw.caches.match(shell, { cacheName })) ?? Response.error()
    }
  }

  sw.addEventListener('install', (event) => {
    event.waitUntil(install())
  })

  sw.addEventListener('activate', (event) => {
    event.waitUntil(activate())
  })

  sw.addEventListener('message', (event) => {
    if (isSkipWaiting(event.data)) void sw.skipWaiting()
  })

  sw.addEventListener('fetch', (event) => {
    const { request } = event
    if (request.method !== 'GET') return

    // The browser checks sw.js after every navigation, and sw.js changes with any precached byte.
    if (request.mode === 'navigate') {
      const page = new URL(request.url)
      page.search = ''
      page.hash = ''
      event.respondWith(shellPaths.has(page.href) ? openShell(request) : openPage(request))
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
