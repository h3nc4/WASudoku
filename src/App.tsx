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

import { ChevronDown, Eraser } from 'lucide-react'
import { useCallback } from 'react'
import { SiGithub } from 'react-icons/si'

import { ModeToggle } from '@/components/mode-toggle'
import { NumberPad } from '@/components/NumberPad'
import { SudokuGrid } from '@/components/SudokuGrid'
import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/Wordmark'

import { AutoFillButton } from './components/controls/AutoFillButton'
import { ClearButton } from './components/controls/ClearButton'
import { HintButton } from './components/controls/HintButton'
import { InputModeToggle } from './components/controls/InputModeToggle'
import { NewPuzzleButton } from './components/controls/NewPuzzleButton'
import { SolveButton } from './components/controls/SolveButton'
import { UndoRedo } from './components/controls/UndoRedo'
import { GameStatus } from './components/GameStatus'
import { HintPanel } from './components/HintPanel'
import { PendingPuzzleDialog } from './components/PendingPuzzleDialog'
import { SelectionScreen } from './components/SelectionScreen'
import { ShareMenu } from './components/ShareMenu'
import { SolverStepsPanel } from './components/SolverStepsPanel'
import { WinDialog } from './components/WinDialog'
import { useSudokuState } from './context/sudoku.hooks'
import { isGridReadOnly } from './context/sudoku.selectors'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSudokuActions } from './hooks/useSudokuActions'
import { useSynchronizedHeight } from './hooks/useSynchronizedHeight'
import { cn } from './lib/utils'

function App() {
  const state = useSudokuState()
  const { ui, solver } = state
  const { eraseActiveCell } = useSudokuActions()
  useKeyboardShortcuts()

  const { sourceRef, targetRef } = useSynchronizedHeight(solver.gameMode === 'visualizing')

  const handleErase = useCallback(() => {
    eraseActiveCell('delete')
  }, [eraseActiveCell])

  const isPlaying = solver.gameMode === 'playing'
  const isControlDisabled = isGridReadOnly(state)
  const showSelectionScreen = solver.gameMode === 'selecting'

  return (
    <div className="text-foreground flex min-h-screen flex-col">
      <header className="relative z-30 container mx-auto flex items-center justify-between p-4">
        <h1>
          <Wordmark className="text-2xl tracking-tight md:text-3xl" />
        </h1>
        <div className="flex items-center gap-1">
          <ShareMenu />
          <Button variant="ghost" size="icon" asChild>
            <a
              href="https://github.com/h3nc4/WASudoku"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub Repository"
            >
              <SiGithub className="size-5" />
            </a>
          </Button>
          <ModeToggle />
        </div>
      </header>

      <main
        className={cn(
          'container mx-auto flex flex-1 flex-col items-center justify-center p-4 transition-opacity duration-200 motion-reduce:transition-none',
          showSelectionScreen && 'pointer-events-none opacity-35',
        )}
      >
        <div className="flex w-full max-w-4xl flex-col items-center gap-8 md:flex-row md:items-start md:justify-center">
          {/* Main content: Grid + Controls */}
          <div ref={sourceRef} className="flex w-full max-w-md flex-col gap-4 md:order-2 md:gap-6">
            <GameStatus />
            <SudokuGrid />
            <HintPanel />
            <div className="flex flex-col gap-4">
              <div className="grid w-full grid-cols-4 place-items-center gap-2">
                <UndoRedo />
                <AutoFillButton />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleErase}
                  disabled={ui.activeCellIndex === null || isControlDisabled}
                  title="Erase selected cell"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <Eraser />
                </Button>
              </div>
              <NumberPad />
              <InputModeToggle />
              <div className="grid w-full grid-cols-2 gap-2">
                <NewPuzzleButton />
                {isPlaying ? <HintButton /> : <SolveButton />}
                {isPlaying && <SolveButton />}
                <ClearButton className={cn(!isPlaying && 'col-span-2')} />
              </div>

              {/* Mobile visual cue for solving steps */}
              {solver.gameMode === 'visualizing' && (
                <div className="text-primary mt-2 flex animate-bounce items-center justify-center motion-reduce:animate-none md:hidden">
                  <span className="text-sm font-medium">Scroll down for solving steps</span>
                  <ChevronDown className="ml-1 size-5" />
                </div>
              )}
            </div>
          </div>

          {/* Side Panel: Shown only in visualization mode */}
          {solver.gameMode === 'visualizing' && (
            <div ref={targetRef} className="w-full md:order-1 md:w-64">
              <SolverStepsPanel />
            </div>
          )}
        </div>
      </main>

      {showSelectionScreen && <SelectionScreen />}
      <WinDialog />
      <PendingPuzzleDialog />

      <footer className="text-muted-foreground/80 container mx-auto p-4 text-center text-xs">
        <a
          href="https://h3nc4.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          <p>🄯 2025-2026 Henrique Almeida.</p>
          <p>Because knowledge should be free.</p>
        </a>
      </footer>
    </div>
  )
}

export default App
