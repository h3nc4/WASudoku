#!/bin/sh
#
# Copyright (C) 2026  Henrique Almeida
# This file is part of WASudoku.
#
# WASudoku is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# WASudoku is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with WASudoku.  If not, see <https://www.gnu.org/licenses/>.

# Builds the solver crate for the browser into src/wasudoku-wasm/pkg/wasudoku_wasm.wasm.
# Usage: wasm-build.sh dev|release. A release build is also shrunk by wasm-opt.
set -eu

cd "$(dirname "$0")/../"

crate=src/wasudoku-wasm
target=wasm32-unknown-unknown
out="${crate}/pkg"
build_dir="${CARGO_TARGET_DIR:-${crate}/target}/${target}"

case "${1:-}" in
dev)
  cargo build --manifest-path "${crate}/Cargo.toml" --target "${target}"
  mkdir -p "${out}"
  cp "${build_dir}/debug/wasudoku_wasm.wasm" "${out}/wasudoku_wasm.wasm"
  ;;
release)
  cargo build --manifest-path "${crate}/Cargo.toml" --target "${target}" --release
  mkdir -p "${out}"
  wasm-opt --enable-bulk-memory -O "${build_dir}/release/wasudoku_wasm.wasm" -o "${out}/wasudoku_wasm.wasm"
  ;;
*)
  echo "Usage: $0 dev|release" >&2
  exit 2
  ;;
esac
