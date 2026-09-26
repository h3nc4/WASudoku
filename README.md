# WASudoku

A Sudoku solver and generator that runs entirely in the browser. The solving engine is Rust compiled to WebAssembly, and it works the way a person would, so it can show the reasoning behind each digit it places rather than only the answer.

It runs offline after the first load. There is no backend and no account, and the page stops requesting anything once it has loaded.

## Live

[wasudoku.h3nc4.com](https://wasudoku.h3nc4.com) _via Cloudflare_, or [gh.wasudoku.h3nc4.com](https://gh.wasudoku.h3nc4.com) _via GitHub Pages_.

Also as a hidden service at `wasudoku.h3nc4cd73utflolf2uxgws3j6rmgzotlwndukabzgzawpzk5fejws5id.onion`.

## Solving a puzzle

Get a puzzle onto the grid by any of these:

- **Paste** an 81-character string straight onto the board.
- **Type** digits, and the focus advances on its own. Arrow keys move, Backspace and Delete clear.
- **Number pad** on screen, which also counts how many of each digit remain unplaced.
- **Export** the grid back out as an 81-character string.

Entry modes cover notes as well as answers. **Normal** places a digit, **Candidate** writes small corner notes, and **Center** writes centre notes for the techniques that read them. Undo and redo step through all of it.

Conflicts are highlighted as they appear, so a digit repeated in a row, a column or a box shows up before the solve runs.

The solver runs in a Web Worker, which keeps the grid responsive while it works.

## Reading the solution

After a solve, the interface replays the steps the logical engine took, one at a time, with the board as it stood at each one. Each step cites the technique that justified it, which is what the list further down explains.

**A puzzle that logic cannot finish has a shorter replay.** The engine applies its techniques first. When those run out with cells still empty, it finishes the grid by backtracking, and backtracking produces a correct answer with no reasoning attached. The replay covers the part logic solved and stops at that point. Puzzles generated at the Extreme setting are where this happens, that being the one level with no guarantee that logic alone reaches the end.

## Generating a puzzle

Five levels, each set by the hardest technique needed rather than by how many digits are given:

| Level   | Needs                                                      |
| ------- | ---------------------------------------------------------- |
| Easy    | basic techniques alone                                     |
| Medium  | intermediate techniques                                    |
| Hard    | advanced techniques, still without backtracking            |
| Expert  | master techniques, still solvable by logic                 |
| Extreme | a unique solution, without a guarantee that logic suffices |

The generator asserts a unique solution at each of the five levels, and its tests check that.

## Installing it

It is a Progressive Web App, which means a browser offers to install it, and an installed copy runs offline. The board, the notes and the undo history are kept in local storage. A closed tab reopens where it was left.

Light and dark themes follow the system setting.

## Techniques

Tried cheapest first. The first one that matches becomes the next step.

### Basic

- **Naked Single.** One candidate remains in a cell, because the other eight digits already appear across its row, its column and its box taken together.
- **Hidden Single.** A digit fits only one cell of a unit, because every other empty cell in that unit already sees that digit elsewhere.

### Intermediate

- **Naked Pair and Naked Triple.** Two or three cells in a unit share exactly the same two or three candidates between them. Those digits have to occupy those cells, so they come off every other cell in the unit.
- **Hidden Pair and Hidden Triple.** Two or three digits appear in only two or three cells of a unit. Those cells have to take those digits, which removes their other candidates.
- **Pointing pairs and triples.** Within one box a digit is confined to one row or column. Its placement falls on that line inside the box, and it comes off the rest of that row or column outside it.
- **Box-line reduction.** Along one row or column a digit is confined to one box. It comes off the cells of that box that fall outside the line.

### Advanced

- **X-Wing.** A digit appears exactly twice in each of two rows, and both pairs occupy the same two columns. Those four cells form a rectangle, and the digit comes off the rest of the two columns. Exchange rows for columns and the same pattern eliminates along the rows instead.
- **Swordfish.** The same idea over three rows and three columns, where the digit appears two or three times in each row and the positions line up on three columns.
- **XY-Wing.** A pivot cell holding X and Y sees two cells holding X,Z and Y,Z. Whichever of X or Y the pivot takes, one of the other two is forced to Z, so Z comes off any cell seeing both of them.
- **XYZ-Wing.** As above, with a pivot holding X, Y and Z. Z comes off any cell that sees all three.
- **Skyscraper.** A digit appears exactly twice in each of two rows, and one pair of ends shares a column. The digit comes off any cell that sees both of the remaining two ends.
- **Two-String Kite.** A row and a column each have exactly two positions for a digit, and one end of each meets inside one box. The digit comes off the cell where the two far ends cross.

### Master

- **Jellyfish.** The X-Wing and Swordfish pattern extended to four rows and four columns.
- **Unique Rectangle, type 1.** The same two candidates appear in four cells spanning two rows, two columns and two boxes. Leaving that standing would give the puzzle a second solution. A valid puzzle has one, which removes the candidates that would complete the rectangle.
- **W-Wing.** The same two candidates appear in two cells that do not see each other, joined by a strong link on one of them. The other candidate comes off any cell that sees both.

### Fallback

- **Backtracking.** Used when the techniques above leave cells empty. It finds the solution without producing a reason for any digit, which is where the step replay ends.

Definitions follow the strategy reference at [SudokuWiki](https://www.sudokuwiki.org/Strategy_Families).

## Built with

The interface is React with Vite, TypeScript, Tailwind CSS and shadcn/ui. State sits in reducers reached through React context, split one per concern, so the board, the notes and the solver each own their own transitions.

The engine is Rust, built with wasm-pack and wasm-bindgen.

## License

<!-- vale off -->

WASudoku is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

WASudoku is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with WASudoku. If not, see <https://www.gnu.org/licenses/>.
