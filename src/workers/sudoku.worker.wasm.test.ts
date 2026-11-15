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

/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initSync } from 'wasudoku-wasm'

import { DIFFICULTIES } from '@/context/sudoku.types'
import { getTechniqueName } from '@/lib/techniques'
import type {
  Requests,
  Responses,
  TaskType,
  WorkerRequest,
  WorkerResponse,
} from '@/workers/protocol'

// Runs the built crate, so this suite needs `npm run wasm:build:dev` first, as `npm run test` does.
const WASM_PATH = resolve('src/wasudoku-wasm/pkg/wasudoku_wasm_bg.wasm')

const BOARD_SIZE = 81
const PUZZLE = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79'
const SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
// No two givens conflict, yet the last cell of row one needs the 9 its column already holds.
const UNSOLVABLE_ROWS = '12345678.' + '........9'
const UNSOLVABLE = UNSOLVABLE_ROWS + '.'.repeat(BOARD_SIZE - UNSOLVABLE_ROWS.length)
const CONFLICTING = '55' + '.'.repeat(BOARD_SIZE - 2)
const NEARLY_EMPTY = '8' + '.'.repeat(BOARD_SIZE - 1)
// The dev build's expert generate peaked at 6.3 s over 400 runs at load 9, so this allows a far busier machine.
const GENERATE_TIMEOUT_MS = 30_000

type Listener = (event: MessageEvent<WorkerRequest>) => Promise<void>
type Request<K extends TaskType = TaskType> = { [T in K]: { type: T } & Requests[T] }[K]

describe('Sudoku worker against the real wasm', () => {
  let listener: Listener
  const postMessage = vi.fn<(response: WorkerResponse) => void>()
  let nextId = 0

  beforeAll(async () => {
    // The worker's own init() then finds the module ready and skips the fetch node cannot make.
    initSync({ module: readFileSync(WASM_PATH) })
    vi.stubGlobal('self', {
      postMessage,
      addEventListener: (_type: string, handler: Listener) => {
        listener = handler
      },
      location: { origin: '' },
    })
    await import('@/workers/sudoku.worker')
  })

  async function send<K extends TaskType>(request: Request<K>): Promise<WorkerResponse> {
    const id = ++nextId
    postMessage.mockClear()
    const data = { ...request, id } as WorkerRequest
    await listener({ data, origin: '' } as MessageEvent<WorkerRequest>)
    expect(postMessage).toHaveBeenCalledOnce()
    const response = postMessage.mock.calls[0][0]
    expect(response.id).toBe(id)
    return response
  }

  async function payloadOf<K extends TaskType>(request: Request<K>): Promise<Responses[K]> {
    const response = await send(request)
    if (response.status !== 'success') throw new Error(response.error)
    return response.payload as Responses[K]
  }

  async function errorOf(request: Request): Promise<string> {
    const response = await send(request)
    if (response.status !== 'error') throw new Error('Expected an error response')
    return response.error
  }

  describe('solve', () => {
    it('returns the solution and steps of the shape the app reads', async () => {
      const { steps, solution } = await payloadOf({ type: 'solve', boardString: PUZZLE })

      expect(solution).toBe(SOLUTION)
      expect(steps.length).toBeGreaterThan(0)
      for (const step of steps) {
        expect(getTechniqueName(step.technique)).toBeDefined()
        expect(Object.keys(step).sort()).toEqual([
          'cause',
          'eliminations',
          'placements',
          'technique',
        ])
        for (const placement of step.placements) {
          expect(SOLUTION[placement.index]).toBe(String(placement.value))
        }
      }
    })

    it('reports a board with no solution', async () => {
      await expect(errorOf({ type: 'solve', boardString: UNSOLVABLE })).resolves.toBe(
        'No solution found for the given puzzle.',
      )
    })

    it('reports a board of the wrong length', async () => {
      await expect(errorOf({ type: 'solve', boardString: '123' })).resolves.toBe(
        'Invalid board string length: expected 81, got 3',
      )
    })

    it('reports a board with an invalid character', async () => {
      await expect(
        errorOf({ type: 'solve', boardString: 'a' + '.'.repeat(BOARD_SIZE - 1) }),
      ).resolves.toBe("Invalid character 'a' in board string at index 0")
    })

    it('reports givens that conflict', async () => {
      await expect(errorOf({ type: 'solve', boardString: CONFLICTING })).resolves.toBe(
        'Invalid puzzle: initial configuration has conflicts.',
      )
    })
  })

  describe('generate', () => {
    it.each(DIFFICULTIES)(
      'returns a %s puzzle with its unique solution',
      async (difficulty) => {
        const { puzzleString, solutionString } = await payloadOf({ type: 'generate', difficulty })

        expect(puzzleString).toMatch(new RegExp(`^[.1-9]{${BOARD_SIZE}}$`))
        expect(solutionString).toMatch(new RegExp(`^[1-9]{${BOARD_SIZE}}$`))
        for (const [index, cell] of [...puzzleString].entries()) {
          if (cell !== '.') expect(solutionString[index]).toBe(cell)
        }
        await expect(payloadOf({ type: 'validate', boardString: puzzleString })).resolves.toEqual({
          isValid: true,
          solutionString,
        })
      },
      GENERATE_TIMEOUT_MS,
    )

    it('reports an unknown difficulty', async () => {
      const difficulty = 'impossible' as (typeof DIFFICULTIES)[number]
      await expect(errorOf({ type: 'generate', difficulty })).resolves.toBe(
        'Invalid difficulty level.',
      )
    })
  })

  describe('validate', () => {
    it('returns the solution of a puzzle that has exactly one', async () => {
      await expect(payloadOf({ type: 'validate', boardString: PUZZLE })).resolves.toEqual({
        isValid: true,
        solutionString: SOLUTION,
      })
    })

    it('rejects a puzzle with more than one solution', async () => {
      await expect(payloadOf({ type: 'validate', boardString: NEARLY_EMPTY })).resolves.toEqual({
        isValid: false,
        solutionString: '',
      })
    })

    it('reports givens that conflict', async () => {
      await expect(errorOf({ type: 'validate', boardString: CONFLICTING })).resolves.toBe(
        'Invalid puzzle: initial configuration has conflicts.',
      )
    })
  })
})
