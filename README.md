# WASudoku

Sudoku in the browser, with a solver written in Rust and compiled to WebAssembly. Puzzles come at five levels, and the solver works a grid the way a person would, by named techniques, with backtracking only where those run out.

Solving and generating run inside the tab, in Web Workers. There is no account and no backend, and once loaded the app works offline and installs as an app.

## Play

[wasudoku.h3nc4.com](https://wasudoku.h3nc4.com) _via Cloudflare_, or [gh.wasudoku.h3nc4.com](https://gh.wasudoku.h3nc4.com) _via GitHub Pages_.

Also as a hidden service at `wasudoku.h3nc4cd73utflolf2uxgws3j6rmgzotlwndukabzgzawpzk5fejws5id.onion`.

Each [release](https://github.com/h3nc4/WASudoku/releases) attaches the static build as `WASudoku.tar.gz` and `WASudoku.tar.xz`, and an Android package, `WASudoku.apk`. The `h3nc4/wasudoku` image on Docker Hub serves the same build with nginx.

## Features

- **Levels by technique.** Easy, Medium, Hard, Expert and Extreme are set by the hardest technique a puzzle needs, and the generator keeps the solution unique.
- **Solve with reasons.** **Solve** lists each step the engine took, with its technique and the cells behind it, and steps through the board as it stood at each one.
- **Hints.** **Hint** shows the next step without placing it, and points at a wrong digit first.
- **Notes and sticky numbers.** Pen, corner and centre notes, auto-fill of candidates, undo and redo, and a sticky mode that locks one digit for a run of taps.
- **Your own puzzles.** **Create Your Own** takes a typed or pasted grid and checks it has one solution. A puzzle shares as a link.
- **Saved as you play.** The game, its timer and its mistakes stay in the browser and reopen where they were left.

[How the solver works](https://wasudoku.h3nc4.com/solver/) describes the engine and each technique it uses.

## License

<!-- vale off -->

WASudoku is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

WASudoku is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with WASudoku. If not, see <https://www.gnu.org/licenses/>.
