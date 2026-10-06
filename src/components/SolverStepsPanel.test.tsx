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

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import { useSudokuState } from '@/context/sudoku.hooks'
import { initialState } from '@/context/sudoku.reducer'
import type { SolvingStep, SudokuState } from '@/context/sudoku.types'
import { useSudokuActions } from '@/hooks/useSudokuActions'

import { SolverStepsPanel } from './SolverStepsPanel'

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
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the panel with initial, final, and all step buttons', { timeout: 10000 }, () => {
    render(<SolverStepsPanel />)
    expect(screen.getByRole('heading', { name: 'Solving Steps' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Initial Board State' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solution' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Step 1: Naked Single/ })).toBeInTheDocument()
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
    const step2Button = screen.getByRole('button', { name: /Step 2: Hidden Single/ })
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

    const step1Button = screen.getByRole('button', { name: /Step 1: Naked Single/ })
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

  it('shows the explanation of the open step', async () => {
    mockUseSudokuState.mockReturnValue({
      ...defaultState,
      solver: { ...defaultState.solver, currentStepIndex: 3 },
    })
    render(<SolverStepsPanel />)
    expect(
      await screen.findByText(/Cells R1C2, R1C3 can only contain the candidates \{4, 6\}/),
    ).toBeInTheDocument()
  })

  describe('step navigation', () => {
    it('moves one step back and forward with the arrow buttons', async () => {
      const user = userEvent.setup()
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        solver: { ...defaultState.solver, currentStepIndex: 5 },
      })
      render(<SolverStepsPanel />)

      await user.click(screen.getByRole('button', { name: 'Previous step' }))
      expect(mockViewSolverStep).toHaveBeenLastCalledWith(4)
      await user.click(screen.getByRole('button', { name: 'Next step' }))
      expect(mockViewSolverStep).toHaveBeenLastCalledWith(6)
    })

    it('disables Previous at the initial board and Next at the solution', () => {
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        solver: { ...defaultState.solver, currentStepIndex: 0 },
      })
      const { rerender } = render(<SolverStepsPanel />)
      expect(screen.getByRole('button', { name: 'Previous step' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Next step' })).toBeEnabled()

      mockUseSudokuState.mockReturnValue(defaultState)
      rerender(<SolverStepsPanel />)
      expect(screen.getByRole('button', { name: 'Previous step' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled()
    })

    it('scrolls the open step into the list viewport', () => {
      const rect = (top: number, bottom: number) => ({ top, bottom }) as DOMRect
      const spy = vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: HTMLElement) {
          if (this.dataset.slot === 'scroll-area-viewport') {
            return rect(100, 300)
          }
          return this.id === 'solver-step-1' ? rect(350, 400) : rect(20, 60)
        })

      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        solver: { ...defaultState.solver, currentStepIndex: 2 },
      })
      const { rerender } = render(<SolverStepsPanel />)
      const viewport = document.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!
      expect(viewport.scrollTop).toBe(100)

      viewport.scrollTop = 200
      mockUseSudokuState.mockReturnValue({
        ...defaultState,
        solver: { ...defaultState.solver, currentStepIndex: 1 },
      })
      rerender(<SolverStepsPanel />)
      expect(viewport.scrollTop).toBe(120)
      spy.mockRestore()
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
    const step1Button = screen.getByRole('button', { name: /Step 1: Naked Single/ })
    await user.click(step1Button)

    // No new action should have been called
    expect(mockViewSolverStep).not.toHaveBeenCalled()
  })
})
