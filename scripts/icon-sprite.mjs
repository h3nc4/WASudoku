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

// Writes the icon sprite from the icons the React app draws, so it is checked in before they go.
// Usage: node scripts/icon-sprite.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { optimize } from 'svgo'

const ROOT = join(import.meta.dirname, '..')
const OUT = join(ROOT, 'src/assets/icons/sprite.svg')
const LUCIDE = join(ROOT, 'node_modules/lucide-react/dist/esm/icons')
const SIMPLE_ICONS = join(ROOT, 'node_modules/react-icons/si/index.mjs')

const ICONS = [
  'brain-circuit',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'eraser',
  'eye',
  'lightbulb',
  'link',
  'loader-circle',
  'lock',
  'lock-open',
  'moon',
  'party-popper',
  'pause',
  'pen-line',
  'pencil',
  'play',
  'redo',
  'share-2',
  'sun',
  'type',
  'undo',
  'wand-sparkles',
  'x',
]

// The default preset deletes a sprite whose symbols are never drawn, drops stroke="none" that the
// .icon rule would override, and merges paths, whose overlapping strokes then antialias differently.
const SAFE = {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          inlineStyles: false,
          removeHiddenElems: false,
          cleanupIds: false,
          removeUnknownsAndDefaults: false,
          mergePaths: false,
        },
      },
    },
  ],
}

const attributes = (props) =>
  Object.entries(props)
    .filter(([name]) => name !== 'key')
    .map(([name, value]) => `${name}="${value}"`)
    .join(' ')

const symbols = []
for (const name of ICONS) {
  const { __iconData } = await import(join(LUCIDE, `${name}.mjs`))
  const body = __iconData.node.map(([tag, props]) => `<${tag} ${attributes(props)}/>`).join('')
  symbols.push(`<symbol id="i-${name}" viewBox="0 0 24 24">${body}</symbol>`)
}
const github = /function SiGithub\s*\([\s\S]*?"d":"([^"]+)"/.exec(
  readFileSync(SIMPLE_ICONS, 'utf8'),
)
if (!github) throw new Error('react-icons no longer ships SiGithub in this form')
symbols.push(
  `<symbol id="i-github" viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="${github[1]}"/></symbol>`,
)

const sprite = `<svg xmlns="http://www.w3.org/2000/svg" class="sprite" aria-hidden="true">${symbols.join('')}</svg>`
writeFileSync(OUT, `${optimize(sprite, SAFE).data}\n`)
