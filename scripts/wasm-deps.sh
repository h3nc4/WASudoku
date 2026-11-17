#!/bin/sh
#
# Copyright (C) 2025-2026  Henrique Almeida
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

set -e

dev_tools="cargo-llvm-cov 0.9.0
cargo-audit 0.22.0"

tools="wasm-opt 0.116.1"

while getopts "d" opt; do
  case "${opt}" in
  d)
    tools="${tools}
${dev_tools}"
    ;;
  *)
    echo "Usage: $0 [-d]
  -d    Include development tools" >&2
    exit 1
    ;;
  esac
done

# A tool counts as installed only at the pinned version, read from the cargo home holding it.
installed() {
  bin="$(command -v "$1")" || return 1
  grep -qF "\"$1 $2 (" "$(dirname "$(dirname "${bin}")")/.crates.toml" 2>/dev/null
}

echo "${tools}" | while read -r name ver; do
  if ! installed "${name}" "${ver}"; then
    echo "installing ${name} ${ver}"
    cargo install "${name}" --version "${ver}" --locked
  fi
done
