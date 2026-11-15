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

import { DIFFICULTIES } from '../core/pool'

/** A screenshot the install sheet shows, which a narrow one marks by leaving `form_factor` out. */
export interface Screenshot {
  readonly name: string
  readonly label: string
  readonly formFactor?: 'wide'
}

export const SCREENSHOTS_DIR = 'screenshots'

export const SCREENSHOTS: readonly Screenshot[] = [
  { name: 'narrow.png', label: 'A puzzle in progress on a phone' },
  { name: 'wide.png', label: 'A puzzle in progress on a desktop', formFactor: 'wide' },
]

/** The query a shortcut opens the app with, `?new=easy` for a new easy puzzle. */
export const NEW_PUZZLE_PARAM = 'new'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const WIDTH_OFFSET = 16
const HEIGHT_OFFSET = 20

/** The pixel size of a PNG, read from its IHDR chunk, as a manifest's `sizes` names it. */
export function pngSize(bytes: Uint8Array): string {
  if (bytes.length < HEIGHT_OFFSET + Uint32Array.BYTES_PER_ELEMENT) throw new Error('not a PNG')
  if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) throw new Error('not a PNG')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return `${String(view.getUint32(WIDTH_OFFSET))}x${String(view.getUint32(HEIGHT_OFFSET))}`
}

const ICON = { src: '/icon-192.png', sizes: '192x192', type: 'image/png' }

/** Adds what installing needs beyond public/manifest.json, which the React build still serves. */
export function webManifest(
  base: Readonly<Record<string, unknown>>,
  screenshotSizes: ReadonlyMap<string, string>,
): Record<string, unknown> {
  return {
    ...base,
    // The id Chrome derived from the old start_url, so installed copies keep their identity.
    id: '/',
    start_url: '/',
    scope: '/',
    // A shortcut goes into the open window, so two copies never race one save.
    launch_handler: { client_mode: ['navigate-existing', 'auto'] },
    shortcuts: DIFFICULTIES.map((difficulty) => ({
      name: `New ${difficulty} puzzle`,
      short_name: difficulty.charAt(0).toUpperCase() + difficulty.slice(1),
      url: `/?${NEW_PUZZLE_PARAM}=${difficulty}`,
      icons: [ICON],
    })),
    screenshots: SCREENSHOTS.map(({ name, label, formFactor }) => ({
      src: `/${SCREENSHOTS_DIR}/${name}`,
      sizes: screenshotSizes.get(name),
      type: 'image/png',
      label,
      ...(formFactor ? { form_factor: formFactor } : {}),
    })),
  }
}
