# WASudoku

Sudoku in the browser, with a solver written in Rust and compiled to WebAssembly. It generates puzzles at five levels and solves a grid the way a person would, by named techniques, falling back to backtracking where those run out. Each digit placed by logic comes with the technique that justified it, and a puzzle typed in by hand is checked for a unique solution before play starts.

Solving and generating happen inside the tab, in Web Workers, without a network request. The app has neither an account nor a backend.

## Live

[wasudoku.h3nc4.com](https://wasudoku.h3nc4.com) _via Cloudflare_, or [gh.wasudoku.h3nc4.com](https://gh.wasudoku.h3nc4.com) _via GitHub Pages_.

Also as a hidden service at `wasudoku.h3nc4cd73utflolf2uxgws3j6rmgzotlwndukabzgzawpzk5fejws5id.onion`.

## Running it locally

The image on Docker Hub serves the built site with nginx on port 80.

```sh
docker run --rm -p 8080:80 h3nc4/wasudoku
```

Then open <http://localhost:8080>. The image starts from scratch and holds nginx with the static files, running as uid 65534. A request for an unknown path returns `index.html` with status 200, as a single-page app expects.

Each release on GitHub also attaches the same static build as `WASudoku.tar.gz` and `WASudoku.tar.xz`, for any web server, and an Android package, `WASudoku.apk`, which wraps the live site as a Trusted Web Activity.

## Playing

The first screen offers **New Puzzle** or **Create Your Own**.

- **New Puzzle** picks a level from the table further down. The app keeps a pool of pre-generated puzzles for each level, refilled in the background up to three, which lets a new game usually start at once.
- **Create Your Own** opens an empty grid for entering a puzzle from elsewhere. **Start Puzzle** then checks it, and a grid with more than one solution, or none, is refused with an error.

During play the starting digits are locked. A timer runs, and every digit that differs from the known solution counts as a mistake. The counter reads out of 3 and turns red at 3, and play carries on past it.

### Entering digits

- **Keyboard.** Digits 1 to 9 fill the selected cell. After a digit that clashes with nothing in its row, column or box, the selection moves to the next cell. Arrow keys move, Backspace erases and steps back, Delete erases in place.
- **Number pad** on screen, which shows how many of each digit are still unplaced.
- **Modes.** **Normal** places a digit, **Candidate** writes small corner notes, and **Center** writes centre notes. A note that clashes with a placed digit is refused, and the clashing cells flash.
- **Auto-fill** writes every valid candidate into every empty cell.
- **Undo and redo** step back and forth through the last 100 board states, notes included.

A digit repeated in a row, a column or a box is highlighted as soon as it is placed, and **Solve Puzzle** stays disabled while any such conflict remains.

### Importing and exporting

The share button in the header copies the current grid to the clipboard as an 81-character string, row by row, with `.` for an empty cell.

Pasting works on the **Create Your Own** grid. The clipboard has to hold exactly 81 characters, each a digit or a `.`, where `0` and `.` both mean empty. Anything else is rejected with a message, and the browser may first ask for permission to read the clipboard.

## Solving

**Solve Puzzle** solves the grid as it stands, including digits the player entered. A wrong digit entered earlier can leave the grid without a solution, and the solve then fails until the board changes.

After a solve, a panel lists the steps the logical engine took. Each step shows its technique and the cells involved, in row and column notation such as `R4C7`. Selecting a step shows the board as it stood at that point, with its candidates and the eliminations that step made. **Exit Visualization** returns to the game.

**When logic runs out, backtracking finishes the grid.** Backtracking produces a correct answer with no reasoning attached. The step list ends with one `Backtracking` entry at the point where logic stopped. Every Extreme puzzle ends that way, by design.

## Levels

A level is set by which techniques a puzzle needs, measured by solving it with the engine below, rather than by how many digits are given.

| Level   | Accepted when                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------ |
| Easy    | basic techniques alone solve it, with at least 32 givens                                               |
| Medium  | the hardest step is intermediate, with at least 5 intermediate steps                                   |
| Hard    | the hardest step is advanced, with at least 3 advanced and 5 intermediate steps, solved by logic alone |
| Expert  | at least 2 master steps, 3 advanced and 5 intermediate, solved by logic alone                          |
| Extreme | logic stalls before the grid is full, and backtracking completes it                                    |

The generator keeps the solution unique at all five levels. It removes givens in pairs placed symmetrically about the centre, and keeps a removal only while one solution remains. A candidate puzzle that misses its level is discarded and the generator starts again.

## Saved state

The board, the notes, the undo history, the timer, the mistake count and the pool of pre-generated puzzles live in the browser's local storage. A closed tab reopens where it was left.

The site has a web manifest, so a browser can install it as an app. It lacks a service worker, which means the page, and an installed copy too, needs a connection to open. Once open, it keeps working without one.

The theme starts dark. The button in the header switches between dark and light, and the choice is remembered.

## Techniques

The engine tries techniques in a fixed order, and the first one that matches becomes the next step. The order follows the levels below, with one exception. Jellyfish is tried together with X-Wing and Swordfish, ahead of the advanced wings.

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

- **Backtracking.** Used when the techniques above leave cells empty. It finds the solution without producing a reason for any digit, which is where the step list ends.

Definitions follow the strategy reference at [SudokuWiki](https://www.sudokuwiki.org/Strategy_Families).

## Building from source

A build needs Node 24 or newer with npm 11 or newer, a Rust toolchain with the `wasm32-unknown-unknown` target, and wasm-pack. `scripts/wasm-deps.sh` installs wasm-pack and wasm-opt through `cargo install`, and with `-d` it adds cargo-llvm-cov and cargo-audit for the tests and the audit.

The dev container in `.devcontainer.json` already includes all of that. Its image is pulled from Docker Hub, or built from `docker/dev.Dockerfile` when that tag is still unpublished.

```sh
git clone https://github.com/h3nc4/WASudoku.git
cd WASudoku
npm ci
npm run dev
```

`npm run dev` compiles the Rust crate in `src/wasudoku-wasm` with wasm-pack first, then starts Vite on <http://localhost:5173>. After a change to the Rust code, `npm run wasm:build:dev` rebuilds the crate.

| Command                | Does                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| `npm run build`        | release build of the crate, a type check, then the site into `dist/`     |
| `npm run preview`      | serves `dist/` locally                                                   |
| `npm test`             | Rust tests under cargo-llvm-cov, then the Vitest suite with coverage     |
| `npm run test:browser` | Vitest in a real browser through Playwright                              |
| `npm run lint`         | ESLint                                                                   |
| `npm run lint:wasm`    | Clippy, with warnings as errors                                          |
| `npm run typecheck`    | `tsc -b`                                                                 |
| `npm run format:check` | Prettier over the whole repository                                       |
| `npm run audit`        | `npm audit` at high severity, and `npm run audit:wasm` for `cargo audit` |

The interface is React with Vite, TypeScript, Tailwind CSS and shadcn/ui. One reducer manages all state, and components read it and dispatch to it through React context. The engine is Rust, bound to JavaScript with wasm-bindgen, and runs in a pool of two to six Web Workers sized from the CPU count.

To build the container image from a checkout, run `docker build -f docker/Dockerfile -t wasudoku .`.

## License

<!-- vale off -->

WASudoku is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

WASudoku is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with WASudoku. If not, see <https://www.gnu.org/licenses/>.
