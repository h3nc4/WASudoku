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

import { parseSolution } from '@/lib/board'
import { calculateCandidates } from '@/lib/utils'

import type {
  SolveSuccessAction,
  StepVisualizationAction,
  ViewSolverStepAction,
} from '../sudoku.actions.types'
import type { BoardState, SolvingStep, SudokuState } from '../sudoku.types'

export const handleSolveStart = (state: SudokuState): SudokuState => ({
  ...state,
  solver: { ...state.solver, isSolving: true },
  ui: { ...state.ui, hint: null },
})

export const handleSolveSuccess = (state: SudokuState, action: SolveSuccessAction): SudokuState => {
  const { steps, solution } = action.result
  if (!solution) {
    return {
      ...state,
      solver: { ...state.solver, isSolving: false, solveFailed: true },
    }
  }
  const solvedBoard: BoardState = solution.split('').map((char, index) => ({
    value: char === '.' ? null : Number.parseInt(char, 10),
    isGiven: state.board[index].isGiven,
    candidates: new Set<number>(),
    centers: new Set<number>(),
  }))

  const solutionNumbers = parseSolution(solution)

  const boardAfterLogic = state.board.map((cell) => ({ ...cell }))
  for (const step of steps) {
    for (const p of step.placements) {
      boardAfterLogic[p.index].value = p.value
    }
  }

  const finalSteps = [...steps]
  if (!boardAfterLogic.every((cell) => cell.value !== null)) {
    finalSteps.push({
      technique: 'Backtracking',
      placements: [],
      eliminations: [],
      cause: [],
    })
  }

  return {
    ...state,
    solver: {
      ...state.solver,
      isSolving: false,
      isSolved: true,
      gameMode: 'visualizing',
      steps: finalSteps,
      currentStepIndex: finalSteps.length,
      visualizationBoard: solvedBoard,
      solution: solutionNumbers,
    },
  }
}

export const handleSolveFailure = (state: SudokuState): SudokuState => ({
  ...state,
  solver: { ...state.solver, isSolving: false, solveFailed: true },
})

/** Reconstructs the board state by applying solver steps up to a given index. */
const reconstructBoard = (
  startingBoard: BoardState,
  steps: readonly SolvingStep[],
  upTo: number,
): BoardState => {
  const values = startingBoard.map((c) => c.value)
  for (let i = 0; i < upTo; i++) {
    for (const p of steps[i].placements) {
      values[p.index] = p.value
    }
  }

  // Reuses a cell whose value is unchanged and whose marks are already empty.
  return startingBoard.map((c, i) =>
    c.value === values[i] && c.candidates.size === 0 && c.centers.size === 0
      ? c
      : { ...c, value: values[i], candidates: new Set<number>(), centers: new Set<number>() },
  )
}

// Recalculates candidates for the board before the current step,
// then re-applies the eliminations made up to it.
const reconstructCandidates = (
  startingBoard: BoardState,
  steps: readonly SolvingStep[],
  upTo: number,
) => {
  // Reconstruct board state *before* the specific step to calculate raw candidates
  const board = reconstructBoard(startingBoard, steps, upTo)
  const candidates = calculateCandidates(board)

  // Re-apply specific eliminations from history up to this point
  for (let i = 0; i < upTo; i++) {
    for (const elim of steps[i].eliminations) {
      candidates[elim.index]?.delete(elim.value)
    }
  }
  return candidates
}

/** Determines which value should be highlighted based on the current step's placements. */
const getHighlightedValueForStep = (
  steps: readonly SolvingStep[],
  stepIndex: number,
): number | null => {
  if (stepIndex > 0 && stepIndex <= steps.length) {
    const currentStep = steps[stepIndex - 1]
    if (currentStep.placements.length > 0) {
      return currentStep.placements[0].value
    }
  }
  return null
}

export const handleViewSolverStep = (
  state: SudokuState,
  action: ViewSolverStepAction,
): SudokuState => {
  if (state.solver.gameMode !== 'visualizing') return state

  let visualizationBoard: BoardState

  if (action.index === state.solver.steps.length) {
    // Show the fully solved board.
    visualizationBoard = state.board.map((c, index) => ({
      ...c,
      value:
        state.solver.solution && state.solver.solution[index] !== 0
          ? state.solver.solution[index]
          : c.value,
      candidates: new Set<number>(),
      centers: new Set<number>(),
    }))
  } else {
    visualizationBoard = reconstructBoard(state.board, state.solver.steps, action.index)
  }

  // Calculate candidates and eliminations based on the state *before* the current step is applied
  const previousStepIndex = Math.max(0, action.index - 1)
  const candidates = reconstructCandidates(state.board, state.solver.steps, previousStepIndex)

  const eliminations = action.index > 0 ? state.solver.steps[action.index - 1].eliminations : []

  const newHighlightedValue = getHighlightedValueForStep(state.solver.steps, action.index)

  return {
    ...state,
    ui: {
      ...state.ui,
      highlightedValue: newHighlightedValue,
    },
    solver: {
      ...state.solver,
      currentStepIndex: action.index,
      visualizationBoard,
      candidatesForViz: candidates,
      eliminationsForViz: eliminations,
    },
  }
}

export const handleExitVisualization = (state: SudokuState): SudokuState => ({
  ...state,
  solver: {
    ...state.solver,
    gameMode: 'playing',
    steps: [],
    currentStepIndex: null,
    visualizationBoard: null,
    candidatesForViz: null,
    eliminationsForViz: null,
    solution: state.solver.solution,
    isSolved: false,
  },
  ui: {
    ...state.ui,
    highlightedValue: null,
    transientConflicts: null,
  },
})

export const handleStepVisualization = (
  state: SudokuState,
  action: StepVisualizationAction,
): SudokuState => {
  const { gameMode, currentStepIndex, steps } = state.solver
  if (gameMode !== 'visualizing' || currentStepIndex === null) return state
  const index = currentStepIndex + action.delta
  if (index < 0 || index > steps.length) return state
  return handleViewSolverStep(state, { type: 'VIEW_SOLVER_STEP', index })
}
