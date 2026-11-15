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

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface Result {
  readonly name: string
  readonly ok: boolean
}

const results: Result[] = []
const notes: string[] = []

/** One line per check, PASS or FAIL with the numbers behind it. */
export function report(name: string, ok: boolean, detail: string) {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

/** A difference the candidate is allowed, such as an accessibility fix, listed but never failed. */
export function note(name: string, detail: string) {
  notes.push(name)
  console.log(`NOTE  ${name}  ${detail}`)
}

export function summary(): number {
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} passed, ${notes.length} notes`)
  return failed
}

export const OUT = process.env.PARITY_OUT ?? 'parity-out'

/** Writes a file under the output directory, named from a check label. */
export function writeOut(name: string, data: string | Buffer) {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, name.replaceAll(/[^\w.-]+/g, '-')), data)
}

/** Every line one text has more often than the other, - for the reference and + for the candidate. */
export function differences(a: string, b: string): string {
  const count = (text: string) => {
    const map = new Map<string, number>()
    for (const line of text.split('\n')) map.set(line, (map.get(line) ?? 0) + 1)
    return map
  }
  const [left, right] = [count(a), count(b)]
  const only = (sign: string, mine: Map<string, number>, theirs: Map<string, number>) =>
    [...mine].flatMap(([line, n]) => ((theirs.get(line) ?? 0) < n ? [`${sign} ${line}`] : []))
  return [...only('-', left, right), ...only('+', right, left)].join(' | ')
}
