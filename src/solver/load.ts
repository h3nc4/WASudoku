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

import init from 'wasudoku-wasm'

import { bindWire, type WireModule } from '../core/codec/abi'

/** The solver module's exports, instantiated by wasm-bindgen while the legacy exports need its imports. */
// At cutover this becomes `new WebAssembly.Instance(module, {}).exports`, the one line that changes.
export const instantiate = (): Promise<unknown> => init()

/** The wire exports, or a rejection if the module fails to load or lacks one. */
export async function loadWire(): Promise<WireModule> {
  const wire = bindWire(await instantiate())
  if (wire === null) throw new TypeError('The solver module lacks a wire export')
  return wire
}
