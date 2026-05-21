# WASudoku

WASudoku is a Sudoku solver that runs locally in the browser using WebAssembly.

## Live

WASudoku is available at: [https://wasudoku.h3nc4.com](https://wasudoku.h3nc4.com) _via Cloudflare_

Or at [https://gh.wasudoku.h3nc4.com](https://gh.wasudoku.h3nc4.com) _via GitHub Pages_

Also available as a hidden service at: `wasudoku.h3nc4cd73utflolf2uxgws3j6rmgzotlwndukabzgzawpzk5fejws5id.onion`

## Features

### Core Engine

- **WASM Solver:** The solver logic is written in Rust and compiled to WebAssembly. It runs in a background Web Worker, ensuring the UI remains responsive during calculations.
- **Hybrid Solving Strategy:** The engine first uses logical, human-like techniques to find a solution path. If logic alone is insufficient, it seamlessly falls back to a backtracking algorithm.
- **Puzzle Generation:** Generates unique, solvable puzzles with a single solution for various difficulty levels: Easy, Medium, Hard, and Extreme, directly in the browser.

### User Interface & Experience

- **Responsive & Modern UI:** Built with React, Vite, Tailwind CSS, and shadcn/ui for a clean, accessible, and responsive layout that works on any device.
- **Light & Dark Modes:** Supports both light and dark themes.
- **Installable as a PWA:** As a Progressive Web App, WASudoku can be installed on a desktop or mobile device for a native, offline-first experience.
- **Local Storage Persistence:** The current board state, including all numbers, pencil marks, and undo/redo history, is automatically saved to the browser's local storage.

### Gameplay Features

- **Solver Visualization:** After a puzzle is solved, the interface reveals all logical steps the solver took. Navigate step-by-step to see the board's state at each stage and understand the reasoning behind each move.
- **Conflict Highlighting:** The board highlights any numbers that break Sudoku rules in a row, column, or 3x3 box.
- **Undo/Redo:** Step backward and forward through any moves.
- **Multiple Input Modes:**
  - **Normal:** Enter the final numbers.
  - **Candidate:** Add small "corner" notes for potential numbers.
  - **Center:** Add "center" notes, used for advanced techniques.
- **Controls:**
  - **Navigation:** Use arrow keys to navigate between cells, and Backspace/Delete to clear. Typing a number automatically advances focus to the next cell.
  - **Number Pad:** An on-screen number pad makes input easy on touch devices and displays a count of remaining numbers to be placed.
  - **Clipboard Support:** Paste an 81-character puzzle string directly onto the grid to start solving.
  - **Export Puzzle:** Copy the current puzzle state as an 81-character string for sharing or saving.

## Supported Solving Techniques

The WASudoku engine solves puzzles much like a human would, sequentially applying logical techniques from easiest to hardest before falling back to brute-force algorithms. This allows the engine to explain its reasoning step-by-step.

Below is a list of the solving techniques supported by the WASudoku engine:

### Basic Techniques

- **Naked Single:** A cell has only one possible candidate remaining because all other numbers are present in its row, column, or 3x3 box.
- **Hidden Single:** Within a specific row, column, or 3x3 box, a number can only be placed in one specific cell because all other empty cells in that unit are blocked.

### Intermediate Techniques

- **Naked Pair / Triple:** Two or three cells in a unit, such as a row, column, or box, contain exactly the same two or three candidates. Since these numbers must go into these cells, they can be eliminated from all other cells in that unit.
- **Hidden Pair / Triple:** Two or three candidates appear in exactly two or three cells within a unit. Since these cells must contain these candidates, all other candidates can be safely eliminated from these specific cells.
- **Pointing Subsets: Pairs and Triples:** If a candidate appears only within a single row or column inside a 3x3 box, it must be placed in that line. Therefore, it can be eliminated from the rest of that row or column outside the box.
- **Box-Line Reduction: Claiming Candidates:** If a candidate in a row or column is confined to a single 3x3 box, it must be placed in that box. It can thus be eliminated from the rest of the cells in that box that do not belong to the row or column.

### Advanced Techniques

- **X-Wing:** A single-candidate pattern where a number appears exactly twice in two distinct rows, and they align in the same two columns, forming a rectangle. The candidate can be eliminated from the rest of those columns, or from the rest of those rows instead.
- **Swordfish:** An extension of the X-Wing pattern across three rows and three columns. If a candidate appears two or three times in three rows and aligns perfectly in three columns, it can be eliminated from the rest of those columns.
- **XY-Wing or Y-Wing:** A pattern involving three bi-value cells: a pivot cell with candidates X and Y, connecting to two pincer cells with candidates X,Z and Y,Z respectively. Regardless of whether the pivot is X or Y, one of the pincers must be Z. Thus, Z can be eliminated from any cell that sees both pincers.
- **XYZ-Wing:** Similar to an XY-Wing, but the pivot cell has three candidates: X, Y, and Z. The candidate Z is eliminated from any cell that sees all three cells.
- **Skyscraper:** A single-digit pattern consisting of two rows or two columns where a candidate appears exactly twice. One pair of cells aligns perfectly in a column, while the other "roof" pair does not. The candidate can be eliminated from any cell seeing both roof cells.
- **Two-String Kite:** A single-digit pattern using a row and a column that both have exactly two positions for a candidate, and they intersect inside a single 3x3 box. The candidate can be eliminated from the intersection of the two ends outside the box.

### Master Techniques

- **Jellyfish:** A massive single-candidate pattern, extending the logic of X-Wing and Swordfish across four rows and four columns.
- **Unique Rectangle, Type 1:** Capitalizes on the meta-rule that a valid Sudoku must have exactly one unique solution. It identifies a "deadly pattern," meaning a rectangle of four identical bi-value cells spanning two rows, two columns, and two boxes, and eliminates candidates to prevent the puzzle from becoming ambiguous.
- **W-Wing:** Uses two identical bi-value cells that do not see each other but are connected by a "strong link" on one of their candidates, meaning a candidate that only appears twice in a unit. It eliminates the other candidate from cells that see both identical bi-value cells.

### Fallback Strategy

- **Backtracking / Brute-force:** If the puzzle cannot be solved using the logical techniques above, which is common to all "Extreme" difficulty puzzles, the engine falls back to a backtracking algorithm to find the solution.

## Architecture

The UI architecture follows the **Context + Reducer Pattern** with an emphasis on **State Domain Isolation**.

This is implemented using React's built-in [useReducer](https://react.dev/reference/react/useReducer) and [useContext](https://react.dev/reference/react/useContext) hooks.

## Stack

- **UI:**
  - [React](https://react.dev/)
  - [Vite](https://vitejs.dev/)
  - [TypeScript](https://www.typescriptlang.org/)
  - [Tailwind CSS](https://tailwindcss.com/)
  - [shadcn/ui](https://ui.shadcn.com/)
- **WebAssembly Module:**
  - [Rust](https://www.rust-lang.org/)
  - [wasm-pack](https://drager.github.io/wasm-pack/)
  - [wasm-bindgen](https://wasm-bindgen.github.io/wasm-bindgen/)

## Sources

These techniques were implemented based on the comprehensive list of Sudoku solving techniques documented on [SudokuWiki.org](https://www.sudokuwiki.org/Strategy_Families).

## License

WASudoku is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

WASudoku is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with WASudoku. If not, see <https://www.gnu.org/licenses/>.
