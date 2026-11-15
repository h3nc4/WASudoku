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

import type { WireModule } from '../core/codec/abi'
import { loadWire } from './load'
import { type Fault, parseRequest, PROTOCOL_VERSION, type Request, type Response } from './protocol'

/** The part of a worker's global scope the solver uses. */
export interface Scope {
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void
  postMessage(message: Response, options: StructuredSerializeOptions): void
}

/** The wire bytes `wire` answers `request` with. */
export function answer(wire: WireModule, request: Request): Uint8Array<ArrayBuffer> {
  switch (request.kind) {
    case 'solve':
      return wire.solve(request.cells)
    case 'validate':
      return wire.validate(request.cells)
    case 'hint':
      return wire.nextStep(request.cells)
    case 'generate':
      return wire.generate(request.difficulty, request.seed)
  }
}

/** Answers each request on `scope` once `load` settles, with a fault if it failed. */
export function serve(scope: Scope, load: Promise<WireModule>): void {
  const ready = load.catch((error: unknown) => {
    console.error('The solver module failed to load', error)
    return null
  })
  const fail = (id: number, fault: Fault) => {
    scope.postMessage({ v: PROTOCOL_VERSION, id, fault }, {})
  }

  const reply = async (data: unknown) => {
    const request = parseRequest(data)
    if (request === null) {
      console.error('The solver dropped a malformed request', data)
      return
    }
    const wire = await ready
    if (wire === null) {
      fail(request.id, 'load')
      return
    }
    let bytes: Uint8Array<ArrayBuffer>
    try {
      bytes = answer(wire, request)
    } catch (error) {
      console.error('The solver module trapped', error)
      fail(request.id, 'trap')
      return
    }
    scope.postMessage(
      { v: PROTOCOL_VERSION, id: request.id, bytes: bytes.buffer },
      { transfer: [bytes.buffer] },
    )
  }

  scope.addEventListener('message', (event) => {
    void reply(event.data)
  })
}

serve(self, loadWire())
