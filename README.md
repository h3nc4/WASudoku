# WASudoku

Sudoku in the browser, with a solver written in Rust and compiled to WebAssembly. It generates puzzles at five levels and solves a grid the way a person would, by named techniques, falling back to backtracking where those run out. Each digit placed by logic comes with the technique that justified it, and a puzzle typed in by hand is checked for a unique solution before play starts.

Solving and generating happen inside the tab, in Web Workers, without a network request. The app has neither an account nor a backend, and once loaded it works offline.

## Live

[wasudoku.h3nc4.com](https://wasudoku.h3nc4.com) _via Cloudflare_, or [gh.wasudoku.h3nc4.com](https://gh.wasudoku.h3nc4.com) _via GitHub Pages_.

Also as a hidden service at `wasudoku.h3nc4cd73utflolf2uxgws3j6rmgzotlwndukabzgzawpzk5fejws5id.onion`.

## Running it locally

The image on Docker Hub serves the built site with nginx on port 80.

```sh
docker run --rm -p 8080:80 h3nc4/wasudoku
```

Then open <http://localhost:8080>. The image starts from scratch and holds nginx with the static files, running as uid 65534. The app has one page, `/`, and a shared puzzle is sent in its `?p=` query, so a request for an unknown path returns `404.html` with status 404, as the Cloudflare deploy does.

Each release on GitHub also attaches the same static build as `WASudoku.tar.gz` and `WASudoku.tar.xz`, for any web server, and an Android package, `WASudoku.apk`, which wraps the live site as a Trusted Web Activity.

## Playing

The first screen offers a button for each of the five levels in the table further down, and **Create Your Own**.

- **A level** starts a puzzle from a pool of pre-generated puzzles kept for each level, refilled in the background up to three, which lets a new game usually start at once.
- **Create Your Own** opens an empty grid for entering a puzzle from elsewhere. **Start Puzzle** then checks it, and a grid with more than one solution, or none, is refused with an error.

During play the starting digits are locked. A status bar shows the level, a timer and the mistake count, where every digit that differs from the known solution counts as a mistake. The counter reads out of 3 and turns red at 3, and play carries on past it.

### Entering digits

- **Keyboard.** Digits 1 to 9 fill the selected cell. During play the selection stays on that cell. On the **Create Your Own** grid, a digit that clashes with nothing in its row, column or box moves the selection to the next cell.
- **Number pad** on screen, which shows how many of each digit are still unplaced and strikes out a digit once all nine are on the board.
- **Modes.** **Pen** places a digit, **Corner** writes small corner notes, and **Center** writes centre notes. A note that clashes with a placed digit is refused, and the clashing cells flash.
- **Auto-fill**, the pencil button, writes every valid candidate into every empty cell.
- **Undo and redo** step back and forth through the last 100 board states, notes included.

A digit repeated in a row, a column or a box is highlighted as soon as it is placed, and **Solve** stays disabled while any such conflict remains.

### Sticky numbers

The lock button beside the eraser turns sticky numbers on. A number pad key then locks that digit, and each tap on a cell applies it in the current mode, so a run of the same digit takes one pad press and a tap per cell. A tap on a cell showing the locked digit removes it again, and a tap on a given only selects it. Pressing the locked key a second time releases the lock.

The lock releases by itself once all nine copies of the digit are placed, and also on pause, on solve and on a new puzzle. The mode stays on from one puzzle to the next until the page reloads. On a keyboard, S toggles the mode and Escape releases the lock.

### Hints

**Hint** shows one step and leaves the board as it was. A wrong digit on the board comes first, marked with "Check this cell", since every later deduction depends on it. With the board clean, the hint is the next step the logical engine would take, with its technique, the cells that justify it, the cells it affects and a sentence of explanation. Where logic has run out, the hint gives the digit for one empty cell.

Any edit to the board dismisses the hint, and so does the close button on its strip below the board.

### Pausing

The pause button in the status bar stops the timer and hides the board behind a **Resume** button. Hiding the tab, by switching to another or minimising the window, pauses the game the same way. It stays paused until resumed. Input, hints and sticky numbers wait until the game resumes.

### Winning

The last correct digit opens a dialog with the level, the time and the number of mistakes, and a button for each level to start the next puzzle. Closing it leaves the solved board in place, and undo can still step back from it.

### Starting over

**Clear Board** returns the grid to its givens, or empties a **Create Your Own** grid. The clear goes into the undo history, so the **Undo** button on its notice, or Ctrl+Z, brings the board back. The timer and the mistake count are kept.

**New Puzzle** opens a menu of the five levels and **Custom**, which opens the **Create Your Own** grid. When the board in progress differs from its starting grid, a confirmation asks before replacing it, since that board cannot be restored.

### Sharing and pasting

The share button in the header has two entries.

- **Copy puzzle link** copies the page address with the givens in a `?p=` parameter, in the 81-character form below, leaving out the player's progress. Opening that link brings up a prompt to start the puzzle, and a start runs the check for a unique solution. The parameter is then dropped from the address, and a malformed `?p=` value is ignored.
- **Copy board as text** copies the current grid with the player's progress. The text is an 81-character string, row by row, with `.` for an empty cell.

Pasting into the grid with Ctrl+V reads the same 81-character form, where `0` and `.` both mean empty and spaces and line breaks are ignored. During play a pasted puzzle brings up the same prompt and uniqueness check as a link. On the **Create Your Own** grid it fills the grid directly. Anything other than 81 such characters is rejected with a message. Pasting reads the text from the paste event itself. The browser then skips the clipboard permission prompt, and the paste works in Firefox too.

### Keyboard shortcuts

Digit, erase, arrow and mode keys act on the selected cell. Undo, redo, the sticky keys and the walkthrough arrows work anywhere on the page outside a text field. An open dialog takes keys first.

| Key                                | Does                                                      |
| ---------------------------------- | --------------------------------------------------------- |
| 1 to 9                             | enters the digit, or toggles the note in Corner or Center |
| 0, Delete                          | erases the selected cell                                  |
| Backspace                          | erases the selected cell and moves to the previous one    |
| Arrow keys                         | move the selection                                        |
| Space, N                           | cycles through Pen, Corner and Center                     |
| Ctrl+Z                             | undo                                                      |
| Ctrl+Y, Ctrl+Shift+Z               | redo                                                      |
| S                                  | turns sticky numbers on or off                            |
| Escape                             | releases the locked sticky digit                          |
| Left and Right arrows, after Solve | step back and forward through the solving steps           |
| Ctrl+V                             | pastes a puzzle string                                    |

On macOS, Cmd works in place of Ctrl.

## Solving

**Solve** solves the grid as it stands, including digits the player entered. During play it first asks for confirmation, since one tap reveals the whole answer. A wrong digit entered earlier can leave the grid without a solution, and the solve then fails until the board changes.

After a solve, a **Solving Steps** panel lists the steps the logical engine took, between an **Initial Board State** row and a **Solution** row. Each step shows its technique and the cells involved, in row and column notation such as `R4C7`, with a sentence explaining it. Selecting a step shows the board as it stood at that point, with its candidates and the eliminations that step made. The previous and next buttons above the list, or the Left and Right arrow keys, walk through the steps one at a time. **Exit Visualization** returns to the game as it was before the solve.

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

The site has a web manifest, so a browser can install it as an app. On the first visit a service worker stores the whole build in the browser, after which the page and an installed copy both open without a connection. Navigations try the network before that copy, so a reload after a release gets the new build. An open tab meanwhile offers the release through an **Update available** toast with a **Reload** button.

## Theme and motion

The theme starts dark. The button in the header switches between dark and light, and the choice is remembered.

The board marks a few moments with brief animation. A completed row, column or box sweeps, a win ripples out from the last digit, a new puzzle fades in box by box, and undo or redo tints the cells it changed. The app respects the reduced motion setting of the operating system. With it on, animations and transitions finish at once and the theme switches without a cross-fade. The step list jumps to the selected step in place of scrolling, and the undo tint holds still for 300 ms before it clears.

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

| Command                       | Does                                                                     |
| ----------------------------- | ------------------------------------------------------------------------ |
| `npm run build`               | release build of the crate, a type check, then the site into `dist/`     |
| `npm run preview`             | serves `dist/` locally                                                   |
| `npm run test`                | Rust tests under cargo-llvm-cov, then the Vitest suite with coverage     |
| `npm run test:browser`        | the Vitest suite in real browsers through Playwright                     |
| `npm run test:e2e`            | Playwright end-to-end tests against the build in `dist/`                 |
| `npm run build:next`          | the Astro interface into `dist-next/`, with its worker and headers       |
| `npm run test:e2e:next`       | Playwright tests of the worker and headers in `dist-next/`               |
| `npm run budget:next:enforce` | the byte budget on `dist-next/`, failing on any overrun                  |
| `npm run parity`              | the parity harness, one build against another                            |
| `npm run lint`                | ESLint                                                                   |
| `npm run lint:wasm`           | Clippy, with warnings as errors                                          |
| `npm run typecheck`           | `tsc -b`                                                                 |
| `npm run format:check`        | Prettier over the whole repository                                       |
| `npm run audit`               | `npm audit` at high severity, and `npm run audit:wasm` for `cargo audit` |

### Tests

`npm run test` runs the Rust tests, the wasm-bindgen tests in `tests/web.rs` compiled to wasm and run in Node by `wasm-pack test --node`, and the Vitest suite in jsdom, building the crate first. Cargo fails it below 100% of lines and functions. That count leaves out `src/lib.rs` and `src/utils.rs`, the wasm-bindgen glue, since every `JsValue` call there panics on a native target. The Node run of `tests/web.rs` and `src/workers/sudoku.worker.wasm.test.ts` cover that glue instead, against the compiled wasm. The other two suites drive real browsers, which `npx playwright install` downloads once. Both run in the same four Playwright projects, `chromium`, `firefox`, `webkit` and `iphone-15`, where the last is WebKit at an iPhone 15 screen size.

- `npm run test:browser` runs the Vitest suite in all four. It needs the crate built, by `npm run wasm:build:dev` or an earlier `npm run dev`, and it watches for changes until `--run` is added.
- `npm run test:e2e` plays the app end to end, from the first visit to sharing, sticky numbers, pausing and winning, with an accessibility scan through axe. It serves `dist/` with `npm run preview` on port 4173, so `npm run build` comes first.

Either takes `-- --project firefox` to run one project. CI runs both suites, one job per project, on every pull request and every push to `main`.

The interface is React with Vite, TypeScript, Tailwind CSS and shadcn/ui. One reducer manages all state, and components read it and dispatch to it through React context. The engine is Rust, bound to JavaScript with wasm-bindgen, and runs in two Web Workers, one for the player's requests and one that refills the puzzle pool in the background.

To build the container image from a checkout, run `docker build -f docker/Dockerfile -t wasudoku .`.

### Astro build

`npm run build:next` builds the new interface into `dist-next/`, which nothing serves until it replaces `dist/`. After the pages, `src/site/finish.ts` writes three files there. `sw.js` is `src/sw/sw.ts` with a precache list of what `dist-next/` holds. `manifest.json` is `public/manifest.json` with an `id`, shortcuts, screenshots from `src/assets/screenshots` and a `launch_handler`. `_headers` comes from `src/site/headers.ts`.

The policy in `_headers` is reported, not enforced, apart from `frame-ancestors`. The build hashes every inline `<script>` and `<style>` in the pages into it. An inline script added to the layout, such as one that sets the theme before the first paint, gets its hash on the next build without an edit to the policy. `docker/Dockerfile` copies that policy into `nginx.conf` through `scripts/nginx-conf.sh`.

The worker answers `/` from the cache of its own version, query included, and any other path from the network. The browser fetches `sw.js` again on each navigation, and any change to a precached file changes `sw.js`. A deploy then installs a waiting worker in the background. Once the player accepts the update, the page posts `{ type: 'SKIP_WAITING' }` to that worker and reloads on `controllerchange`.

Each shortcut opens `/?new=<difficulty>`, with `easy`, `medium`, `hard`, `expert` or `extreme`. The app is expected to start a new puzzle of that difficulty and drop the query with `history.replaceState`, so a reload does not start another. `launch_handler` sends a shortcut into a window already open, which reloads it there.

`npm run test:e2e:next` runs `e2e/next` against `dist-next/` in Chromium, Firefox and WebKit, through a server that applies `_headers` as the edge does. It checks the headers on every path, a 404 included, that the app and its 404 page break none of the policy, that a style without a hash is reported, the worker install, a reload with the server stopped and the update flow. CI runs it in each browser job after `npm run test:e2e`, from the `dist-next/` the build job uploads.

### Byte budget

`scripts/budget.sh` brotli-compresses a build at quality 11 and sums the bytes a first visit downloads in each class, against one limit table. CI runs it on `dist/` and on `dist-next/` after the builds. An overrun prints a warning and the job still passes. Both builds are read against the same table, which shows how far `dist/` sits from the limits. `sh scripts/budget.test.sh` checks the class rules against a throwaway build.

| Class        | Counts                                                                                | Limit   |
| ------------ | ------------------------------------------------------------------------------------- | ------- |
| `html`       | `index.html` without the text of its inline `<style>` elements                        | 5.6 KB  |
| `css`        | every stylesheet, and the inline `<style>` text as `index.html:style`                 | 9.0 KB  |
| `initial_js` | the scripts and module preloads that `index.html` references                          | 25.0 KB |
| `fonts`      | every font file                                                                       | 32.6 KB |
| `wasm`       | the wasm, the workers and any script that references a `.wasm` file                   | 30.0 KB |
| `icons`      | the manifest and each `rel="icon"` link without `sizes`                               | 1.5 KB  |
| `sw`         | `sw.js`                                                                               | 0.8 KB  |
| `install`    | sized icons, `apple-touch-icon` and every `src` in the manifest, screenshots included | none    |
| `other`      | everything else, such as lazy chunks, `404.html` and the link preview image           | none    |

Each limit is the size of `dist-next/` plus 10%, rounded up to 100 bytes. `dist-next/` does not hold a script or wasm yet. Those two rows hold provisional limits until the first build that has them. `npm run budget:next:enforce` runs the same check on `dist-next/` with `--enforce`, which exits 1 on any overrun. CI does not call it yet. Once the Astro interface adds its scripts and worker and `dist-next/` is about to replace `dist/`, the limits are measured again and the build job runs `npm run budget:next:enforce` in place of the warning-only run.

### Parity harness

`parity/` compares two builds of the app, a reference and a candidate, by driving both through the same steps in Chromium. It exists to prove that a rewrite behaves like the build it replaces. Each check prints one `PASS` or `FAIL` line with its numbers, and the run exits non-zero on any failure.

```sh
npm run build
scripts/parity.sh dist dist parity-out
```

`scripts/parity.sh <reference> <candidate> [output dir]` runs the harness in the Playwright image that `package.json` pins. Each build is a `dist` directory or a URL, which the harness serves or proxies on a loopback port of its own. Diff images are written to the output directory, `parity-out` by default. `PARITY_ONLY` picks checks from `states`, `pixels`, `a11y`, `keys`, `persistence` and `pwa`, `PARITY_SCENARIOS` picks scenarios by name, and `PARITY_KEEP=1` also keeps every reference frame. Inside the image, `npm run parity` does the same with `PARITY_REF` and `PARITY_CANDIDATE` set.

- **States.** Every scenario in `parity/scenarios.ts` runs in light and dark, from the selection screen and each difficulty through entries, notes, conflicts, hints, the walkthrough, custom entry, pause, the win dialog, the confirmations and both menus. Each named capture compares what the player sees through accessible names and the documented test ids, and the whole of `localStorage` byte for byte.
- **Pixels.** Each capture is a full-page screenshot at 360, 412, 768, 1024, 1350 and 1920 px, allowed 0.02% of differing pixels, with the page height compared at each width. The timer is the only mask, named in `MASKS`.
- **Accessibility.** The accessible tree and the axe results run in one direction. A node or a fix in the candidate is a `NOTE`, and a lost node or a new violation is a `FAIL`.
- **Keys.** Every key from `src/core/keymap.ts` once it exists and exports `KEYS`, `KEYMAP` or `BINDINGS`, or else every key the React handlers compare, is pressed with six modifier sets in nine modes, comparing the state after each press.
- **Persistence.** The final save of each fixed scenario opens in both builds, which must show and keep the same.
- **PWA.** The service worker install, an offline reload with a new game from the pool, and the update offer after a deploy are compared as what each build does.

The scenarios start from literal saves in `e2e/saves.ts` and a pool deep enough that no build generates, with a paused fake clock and a pinned `Math.random`. Generation itself is random in today's build. The first visit with an empty pool, the pool refill and the distribution of generated puzzles are left out until seeded generation is merged behind `seedGeneration` in `parity/determinism.ts`, and the run lists them as notes.

### Font

The interface uses Recursive, cut down from the `@fontsource-variable/recursive` package to two files in `src/assets/fonts`. `recursive-main.woff2` contains the sans and mono voices at weights 400 to 800, and `recursive-casual-digits.woff2` contains only the digits that pencil marks and player entries draw in the casual voice. Both files are checked in. A normal build doesn't run Python.

`scripts/font-subset.sh` rebuilds them in a pinned Python image and needs only Docker. It takes printable ASCII plus any other character it finds in `index.html` and in the source under `src`, leaving out tests. A character Recursive lacks, such as the copyleft sign in the footer, is reported and left to a fallback font.

Run `scripts/font-subset.sh` and commit both files after a change that brings a new character into UI text, a new weight or voice, or a new version of the source package, its Python image or `scripts/font-requirements.txt`. CI runs `scripts/font-subset.sh --check`, which fails when a fresh build differs from the checked-in files by even one byte. It also runs `scripts/font-subset.sh --test`, which checks that the walk reads `.astro` markup and skips tests.

## License

<!-- vale off -->

WASudoku is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

WASudoku is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with WASudoku. If not, see <https://www.gnu.org/licenses/>.
