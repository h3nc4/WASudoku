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

# Runs scripts/comment-length.sh against a throwaway repository, one commit per case.
set -eu

SCRIPT="$(CDPATH="" cd -- "$(dirname -- "$0")" && pwd)/comment-length.sh"
REPO="$(mktemp -d)"
trap 'rm -rf "${REPO}"' EXIT
failures=0

git -C "${REPO}" init -q
git -C "${REPO}" config user.email t@example.com
git -C "${REPO}" config user.name t
git -C "${REPO}" config commit.gpgsign false
git -C "${REPO}" commit -q --allow-empty -m base
BASE="$(git -C "${REPO}" rev-parse HEAD)"

# Commits $4 as file $2 and expects the check to exit $3. printf expands the escapes.
expect() {
  name="$1"
  git -C "${REPO}" checkout -q --detach "${BASE}"
  printf '%b' "$4" >"${REPO}/$2"
  git -C "${REPO}" add "$2"
  git -C "${REPO}" commit -qm "${name}"
  status=0
  (cd "${REPO}" && sh "${SCRIPT}" --base "${BASE}") >/dev/null || status=$?
  if [ "${status}" -eq "$3" ]; then
    echo "ok   ${name}"
  else
    echo "FAIL ${name}: exit ${status}, expected $3"
    failures=$((failures + 1))
  fi
}

header="$(sed -n '1,17p' "${SCRIPT}")"
expect agpl_header_passes licensed.sh 0 "${header}\nset -eu\n"
expect spdx_header_passes spdx.js 0 '// SPDX-License-Identifier: MIT\n// one\n// two\nconst x = 1\n'
expect top_block_fails top.sh 1 '# one\n# two\n# three\nset -eu\n'
expect block_under_name_fails ci.yml 1 'name: CI\n\n# one\n# two\n# three\non: push\n'
expect two_lines_pass short.js 0 'x = 1\n\n// one\n// two\ny = 2\n'

[ "${failures}" -eq 0 ]
