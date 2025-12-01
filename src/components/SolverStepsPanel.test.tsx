/*
 * Copyright (C) 2025  Henrique Almeida
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

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { SolverStepsPanel } from './SolverStepsPanel'
import { useSudokuState } from '@/context/sudoku.hooks'
import { useSudokuActions } from '@/hooks/useSudokuActions'
import { initialState } from '@/context/sudoku.reducer'
import type { SudokuState, SolvingStep } from '@/context/sudoku.types'

// Mocks
vi.mock('@/context/sudoku.hooks')
vi.mock('@/hooks/useSudokuActions')

const mockUseSudokuState = useSudokuState as Mock
const mockUseSudokuActions = useSudokuActions as Mock

const mockSteps: SolvingStep[] = [
  {
    technique: 'NakedSingle',
    placements: [{ index: 0, value: 5 }],
    eliminations: [],
    cause: [],
  },
  {
    technique: 'HiddenSingle',
    placements: [{ index: 10, value: 3 }],
    eliminations: [],
    cause: [],
  },
  {
    technique: 'NakedPair',
    placements: [],
    eliminations: [],
    cause: [
      { index: 1, candidates: [4, 6] },
      { index: 2, candidates: [4, 6] },
    ],
  },
  {
    technique: 'HiddenPair',
    placements: [],
    eliminations: [],
    cause: [
      { index: 20, candidates: [7, 8] },
      { index: 21, candidates: [7, 8] },
    ],
  },
  {
    technique: 'NakedTriple',
    placements: [],
    eliminations: [],
    cause: [
      { index: 30, candidates: [1, 2, 3] },
      { index: 31, candidates: [1, 2, 3] },
      { index: 32, candidates: [1, 2, 3] },
    ],
  },
  {
    technique: 'HiddenTriple',
    placements: [],
    eliminations: [],
    cause: [
      { index: 40, candidates: [5, 6, 9] },
      { index: 41, candidates: [5, 6, 9] },
      { index: 42, candidates: [5, 6, 9] },
    ],
  },
  {
    technique: 'PointingPair',
    placements: [],
    eliminations: [],
    cause: [{ index: 60, candidates: [8] }],
  },
  {
    technique: 'PointingTriple',
    placements: [],
    eliminations: [],
    cause: [{ index: 50, candidates: [1] }],
  },
  {
    technique: 'ClaimingCandidate',
    placements: [],
    eliminations: [],
    cause: [{ index: 70, candidates: [2] }],
  },
  {
    technique: 'X-Wing',
    placements: [],
    eliminations: [],
    cause: [{ index: 0, candidates: [5] }], // Mock cause cell for X-Wing
  },
  {
    technique: 'Swordfish',
    placements: [],
    eliminations: [],
    cause: [{ index: 0, candidates: [7] }], // Mock cause cell for Swordfish
  },
  {
    technique: 'XY-Wing',
    placements: [],
    eliminations: [{ index: 20, value: 3 }],
    cause: [
      { index: 0, candidates: [1, 2] }, // Pivot (R1C1)
      { index: 1, candidates: [1, 3] }, // Pincer 1 (R1C2)
      { index: 9, candidates: [2, 3] }, // Pincer 2 (R2C1)
    ],
  },
  {
    technique: 'XYZ-Wing',
    placements: [],
    eliminations: [{ index: 20, value: 3 }],
    cause: [
      { index: 0, candidates: [1, 2, 3] }, // Pivot (R1C1)
      { index: 1, candidates: [1, 3] }, // Pincer 1 (R1C2)
      { index: 9, candidates: [2, 3] }, // Pincer 2 (R2C1)
    ],
  },
  {
    technique: 'Skyscraper',
    placements: [],
    eliminations: [{ index: 80, value: 1 }],
    cause: [{ index: 0, candidates: [5] }], // Mock cause cell
  },
  {
    technique: 'TwoStringKite',
    placements: [],
    eliminations: [{ index: 80, value: 1 }],
    cause: [{ index: 0, candidates: [7] }], // Mock cause cell
  },
  {
    technique: 'Jellyfish',
    placements: [],
    eliminations: [],
    cause: [{ index: 0, candidates: [4] }],
  },
  {
    technique: 'UniqueRectangleType1',
    placements: [],
    eliminations: [{ index: 10, value: 2 }], // Eliminating from R2C2
    cause: [{ index: 0, candidates: [2, 8] }], // Pattern on {2, 8}
  },
  {
    technique: 'W-Wing',
    placements: [],
    eliminations: [{ index: 20, value: 5 }],
    cause: [{ index: 0, candidates: [5, 9] }], // Pair {5, 9}
  },
  {
    technique: 'Backtracking',
    placements: [],
    eliminations: [],
    cause: [],
  },
]

describe('SolverStepsPanel component', () => {
  const mockViewSolverStep = vi.fn()
  const defaultState: SudokuState = {
    ...initialState,
    solver: {
      ...initialState.solver,
      gameMode: 'visualizing',
      steps: mockSteps,
      currentStepIndex: mockSteps.length, // Start at solution
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSudokuState.mockReturnValue(defaultState)
    mockUseSudokuActions.mockReturnValue({
      viewSolverStep: mockViewSolverStep,
    })
  })

  it('renders nothing if there are no solver steps', () => {
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      solver: { ...defaultState.solver, steps: [] },
    })
    const { container } = render(<SolverStepsPanel />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the panel with initial, final, and all step buttons', { timeout: 10000 }, () => {
    render(<SolverStepsPanel />)
    expect(screen.getByRole('heading', { name: 'Solving Steps' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Initial Board State' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solution' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Step 1: NakedSingle/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Step 19: Backtracking/ })).toBeInTheDocument()
  })

  it('calls viewSolverStep(0) when "Initial Board State" is clicked', async () => {
    const user = userEvent.setup()
    render(<SolverStepsPanel />)
    await user.click(screen.getByRole('button', { name: 'Initial Board State' }))
    expect(mockViewSolverStep).toHaveBeenCalledWith(0)
  })

  it('calls viewSolverStep(steps.length) when "Solution" is clicked', async () => {
    const user = userEvent.setup()
    render(<SolverStepsPanel />)
    await user.click(screen.getByRole('button', { name: 'Solution' }))
    expect(mockViewSolverStep).toHaveBeenCalledWith(mockSteps.length)
  })

  it('calls viewSolverStep when an accordion trigger is clicked', async () => {
    const user = userEvent.setup()
    render(<SolverStepsPanel />)

    // Click step 2 (index 1)
    const step2Button = screen.getByRole('button', { name: /Step 2: HiddenSingle/ })
    await user.click(step2Button)

    // Should dispatch index + 1
    expect(mockViewSolverStep).toHaveBeenCalledWith(2)
  })

  it('highlights the correct buttons based on currentStepIndex', () => {
    // When viewing step 1 (index 0), its accordion should be active
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      solver: { ...defaultState.solver, currentStepIndex: 1 },
    })
    const { rerender } = render(<SolverStepsPanel />)

    const step1Button = screen.getByRole('button', { name: /Step 1: NakedSingle/ })
    expect(step1Button).toHaveAttribute('data-state', 'open')

    // When viewing initial state
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      solver: { ...defaultState.solver, currentStepIndex: 0 },
    })
    rerender(<SolverStepsPanel />)
    expect(screen.getByRole('button', { name: 'Initial Board State' })).toHaveAttribute(
      'data-state',
      'active',
    )
    expect(screen.getByRole('button', { name: 'Solution' })).toHaveAttribute(
      'data-state',
      'inactive',
    )

    // When viewing final state
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      solver: { ...defaultState.solver, currentStepIndex: mockSteps.length },
    })
    rerender(<SolverStepsPanel />)
    expect(screen.getByRole('button', { name: 'Solution' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('button', { name: 'Initial Board State' })).toHaveAttribute(
      'data-state',
      'inactive',
    )
  })

  describe('Step Explanations', () => {
    const testCases: {
      stepIndex: number
      expectedText: RegExp
    }[] = [
      { stepIndex: 1, expectedText: /Cell R1C1 had only one possible candidate/ },
      {
        stepIndex: 2,
        expectedText:
          /Within its row, column, or box, the number 3 could only be placed in cell R2C2. This is a Hidden Single./,
      },
      {
        stepIndex: 3,
        expectedText: /Naked Pair: Cells R1C2, R1C3 can only contain the candidates \{4, 6\}/,
      },
      {
        stepIndex: 4,
        expectedText:
          /Hidden Pair: In their shared unit, the candidates \{7, 8\} only appear in cells R3C3, R3C4/,
      },
      {
        stepIndex: 5,
        expectedText:
          /Naked Triple: Cells R4C4, R4C5, R4C6 form a triple with candidates \{1, 2, 3\}/,
      },
      {
        stepIndex: 6,
        expectedText:
          /Hidden Triple: In their shared unit, the candidates \{5, 6, 9\} only appear in cells R5C5, R5C6, R5C7/,
      },
      {
        stepIndex: 7,
        expectedText: /Pointing Subgroup: The candidates \{8\} in one box are confined/,
      },
      {
        stepIndex: 8,
        expectedText: /Pointing Subgroup: The candidates \{1\} in one box are confined/,
      },
      {
        stepIndex: 9,
        expectedText:
          /Box-Line Reduction \(Claiming\): The candidates \{2\} in a row or column are confined to a single box/,
      },
      {
        stepIndex: 10,
        expectedText:
          /X-Wing: The candidate 5 appears in only two positions in two rows \(or columns\)/,
      },
      {
        stepIndex: 11,
        expectedText:
          /Swordfish: The candidate 7 appears in only two or three positions in three rows/,
      },
      {
        stepIndex: 12,
        expectedText: /XY-Wing: Pivot R1C1 and pincers R1C2, R2C1 form a Y-Wing pattern/,
      },
      {
        stepIndex: 13,
        expectedText: /XYZ-Wing: Pivot R1C1 and pincers R1C2, R2C1 form a bent triple connection/,
      },
      {
        stepIndex: 14,
        expectedText:
          /Skyscraper: Two rows \(or columns\) have the candidate 5 in only two positions/,
      },
      {
        stepIndex: 15,
        expectedText:
          /Two-String Kite: A row and a column each have exactly two positions for candidate 7/,
      },
      {
        stepIndex: 16,
        expectedText:
          /Jellyfish: The candidate 4 appears in specific positions across four rows \(or columns\)/,
      },
      {
        stepIndex: 17,
        expectedText:
          /Unique Rectangle \(Type 1\): A "deadly pattern" of candidates \{2, 8\} was detected in two boxes.*removed from cell R2C2/,
      },
      {
        stepIndex: 18,
        expectedText: /W-Wing: Two cells contain the identical pair \{5, 9\}/,
      },
      {
        stepIndex: 19,
        expectedText:
          /The available logical techniques were not sufficient to solve the puzzle. A backtracking \(brute-force\) algorithm was used to find the solution./,
      },
    ]

    for (const { stepIndex, expectedText } of testCases) {
      it(`shows the correct explanation for step ${stepIndex}`, async () => {
        mockUseSudokuState.mockReturnValue({
          ...defaultState,
          solver: { ...defaultState.solver, currentStepIndex: stepIndex },
        })
        render(<SolverStepsPanel />)
        expect(await screen.findByText(expectedText)).toBeInTheDocument()
      })
    }

    it('shows the correct explanation for a default/unknown case', async () => {
      const magicSteps = [{ technique: 'Magic', placements: [], eliminations: [], cause: [] }]
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        solver: {
          ...defaultState.solver,
          steps: magicSteps,
          currentStepIndex: 1,
        },
      })
      render(<SolverStepsPanel />)
      expect(await screen.findByText('Technique used: Magic.')).toBeInTheDocument()
    })

    it('handles malformed W-Wing data gracefully (coverage for fallback)', async () => {
      const malformedStep: SolvingStep = {
        technique: 'W-Wing',
        placements: [],
        eliminations: [{ index: 20, value: 5 }],
        cause: [{ index: 0, candidates: [5] }], // Missing the second candidate
      }

      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        solver: {
          ...defaultState.solver,
          steps: [malformedStep],
          currentStepIndex: 1,
        },
      })
      render(<SolverStepsPanel />)
      // valB should fall back to 0 because find() returns undefined for 5 (valX)
      expect(
        await screen.findByText(/W-Wing: Two cells contain the identical pair \{5, 0\}/),
      ).toBeInTheDocument()
    })
  })

  it('does not call viewSolverStep when an accordion item is closed', async () => {
    const user = userEvent.setup()
    // Start with an item open
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      solver: { ...defaultState.solver, currentStepIndex: 1 },
    })
    render(<SolverStepsPanel />)

    mockViewSolverStep.mockClear()

    // Click the already-open trigger to close it
    const step1Button = screen.getByRole('button', { name: /Step 1: NakedSingle/ })
    await user.click(step1Button)

    // No new action should have been called
    expect(mockViewSolverStep).not.toHaveBeenCalled()
  })
})
