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

import { readFile, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize } from 'node:path'

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
}

const NOT_FOUND = 404
const OK = 200
const LOOPBACK = '127.0.0.1'

export type Transform = (body: string) => string

/** One build behind a local origin, which can be taken down or redeployed with a rewritten file. */
export interface Site {
  readonly name: string
  readonly origin: string
  /** While down, every request fails at the socket, as a stopped server does. */
  down: boolean
  rewrite(path: string, transform: Transform | null): void
  close(): Promise<void>
}

interface Body {
  readonly status: number
  readonly type: string
  readonly data: Buffer
}

async function fromDirectory(root: string, path: string): Promise<Body> {
  const file = join(root, normalize(path.endsWith('/') ? `${path}index.html` : path))
  const isFile = await stat(file).then(
    (s) => s.isFile(),
    () => false,
  )
  if (!isFile) {
    const page = await readFile(join(root, '404.html')).catch(() => Buffer.from('Not found'))
    return { status: NOT_FOUND, type: MIME['.html'] ?? 'text/html', data: page }
  }
  const type = MIME[extname(file)] ?? 'application/octet-stream'
  return { status: OK, type, data: await readFile(file) }
}

async function fromUpstream(base: string, path: string): Promise<Body> {
  const response = await fetch(new URL(path, base))
  const type = response.headers.get('content-type') ?? 'application/octet-stream'
  return { status: response.status, type, data: Buffer.from(await response.arrayBuffer()) }
}

/** Serves a dist directory, or proxies a URL, on a free loopback port. */
export async function startSite(name: string, source: string): Promise<Site> {
  const isUrl = /^https?:\/\//.test(source)
  const rewrites = new Map<string, Transform>()
  const load = (path: string) => (isUrl ? fromUpstream(source, path) : fromDirectory(source, path))

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    if (site.down) {
      req.socket.destroy()
      return
    }
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname)
    const body = await load(path)
    const transform = rewrites.get(path)
    const data = transform ? Buffer.from(transform(body.data.toString('utf8'))) : body.data
    res.writeHead(body.status, { 'content-type': body.type, 'cache-control': 'no-cache' })
    res.end(data)
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(() => req.socket.destroy())
  })
  await new Promise<void>((resolve) => server.listen(0, LOOPBACK, resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? (address satisfies AddressInfo).port : 0

  const site: Site = {
    name,
    origin: `http://${LOOPBACK}:${port}`,
    down: false,
    rewrite: (path, transform) => {
      if (transform) rewrites.set(path, transform)
      else rewrites.delete(path)
    },
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
  return site
}
