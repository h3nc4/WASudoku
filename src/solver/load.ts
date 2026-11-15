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

import { bindWire, type WireModule } from '../core/codec/abi'
import wasmUrl from '../wasudoku-wasm/pkg/wasudoku_wasm.wasm?url'

/** The solver module imports nothing from the host. */
const NO_IMPORTS = {}

/** The solver module's exports, compiled while the module streams in. */
export async function instantiate(): Promise<unknown> {
  const { instance } = await WebAssembly.instantiateStreaming(fetch(wasmUrl), NO_IMPORTS)
  return instance.exports
}

/** The wire exports, or a rejection if the module fails to load or lacks one. */
export async function loadWire(): Promise<WireModule> {
  const wire = bindWire(await instantiate())
  if (wire === null) throw new TypeError('The solver module lacks a wire export')
  return wire
}
