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

import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import { headersFor, parseHeaders } from '../../src/site/headers'

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm',
}
const NOT_FOUND = 404

export interface ServeOptions {
  /** Called with the path of each response once it is sent. */
  readonly onResponse?: (pathname: string) => void
}

export interface StaticSite {
  readonly url: string
  close(): Promise<void>
}

/** The file a path names, with a directory standing for its index.html, or undefined. */
function fileFor(root: string, pathname: string) {
  const file = path.join(root, decodeURIComponent(pathname))
  if (!file.startsWith(root)) return undefined
  const page =
    existsSync(file) && statSync(file).isDirectory() ? path.join(file, 'index.html') : file
  return existsSync(page) && statSync(page).isFile() ? page : undefined
}

// Serves a build as the edge does, `_headers` on every response and 404.html for a missing path.
// Each request reads the disk afresh, so a test can deploy into the directory.
export async function serveSite(root: string, options: ServeOptions = {}): Promise<StaticSite> {
  const server: Server = createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://site')
    res.on('finish', () => options.onResponse?.(pathname))
    const rules = parseHeaders(readFileSync(path.join(root, '_headers'), 'utf8'))
    const found = path.basename(pathname).startsWith('_') ? undefined : fileFor(root, pathname)
    const file = found ?? path.join(root, '404.html')
    res.statusCode = found ? res.statusCode : NOT_FOUND
    res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream')
    for (const [name, value] of headersFor(rules, pathname)) res.setHeader(name, value)
    res.end(readFileSync(file))
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://localhost:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
