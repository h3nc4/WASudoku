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

export default {
  // UI: Lint & Format staged files
  '*.{js,jsx,ts,tsx}': ['prettier --write', 'eslint --fix'],

  // Format config
  '*.{json,md,html,css}': ['prettier --write'],

  // WASM: Format individual files, then Lint the whole crate (ignoring file args)
  'src/wasudoku-wasm/**/*.rs': [
    'cargo fmt --manifest-path src/wasudoku-wasm/Cargo.toml --',
    () => 'npm run lint:wasm', // Using a function ignores the passed filenames
  ],
}
