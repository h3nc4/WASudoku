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

# Fails on a comment block past two lines that this branch added since <ref>.
# Vendored from h3nc4-infra scripts/comment-length.sh, so change the two together.

# Usage: comment-length.sh --base <ref> [file...]
set -eu

LIMIT=2

# Lines HEAD added to file $1 since ${BASE}, as "start:count" pairs.
added_ranges() {
  git diff -U0 "${BASE}...HEAD" -- "$1" |
    sed -n 's/^@@ -[0-9,]* +\([0-9]*\),\{0,1\}\([0-9]*\) @@.*/\1:\2/p'
}

# `--` opens a CSS custom property and `#` an id selector, so neither marks a comment there.
line_markers() {
  case "$1" in
  *.css) echo '' ;;
  *.scss | *.sass | *.less | *.rs) echo '//' ;;
  *.sql | *.lua | *.hs) echo '--' ;;
  *) echo '//|#' ;;
  esac
}

runs_over_limit() {
  markers="$(line_markers "$1")"
  awk -v limit="${LIMIT}" -v ranges="$2" -v markers="${markers}" '
    BEGIN {
      line_re = markers == "" ? "" : "^(" markers ")"
      # mawk on a GitHub runner takes no {3,} interval, so the three are spelled out.
      rule_re = markers == "" ? "" : "^(" markers ")[[:space:]]*[-=#*][-=#*][-=#*]+[[:space:]]*$"
      n = split(ranges, parts, "\n")
      for (i = 1; i <= n; i++) {
        if (parts[i] == "") continue
        split(parts[i], pair, ":")
        lo[i] = pair[1] + 0
        hi[i] = pair[1] + (pair[2] == "" ? 1 : pair[2] + 0) - 1
      }
    }
    function touches_change(from, to) {
      for (i = 1; i <= n; i++)
        if (lo[i] <= to && hi[i] >= from) return 1
      return 0
    }
    # A header is known by its wording, since any comment can open a file.
    function is_header(from, to,   _i) {
      for (_i = from; _i <= to; _i++)
        if (text[_i] ~ /SPDX-License-Identifier|Copyright|General Public License|All rights reserved|[Ss]ee LICENSE/) return 1
      return 0
    }
    function report(   from, to) {
      from = start
      to = start + run - 1
      if (run <= limit || is_header(from, to) || !touches_change(from, to)) return
      printf "%s:%d-%d  %d lines\n", FILENAME, from, to, run
    }
    {
      text[FNR] = $0
      line = $0
      sub(/^[[:space:]]+/, "", line)
      is_comment = 0
      if (in_block) {
        is_comment = 1
        if (line ~ /\*\//) in_block = 0
      } else if (line ~ /^\/\*/ && line !~ /\*\//) {
        is_comment = 1
        in_block = 1
      } else if ((line_re != "" && line ~ line_re) || line ~ /^\/\*.*\*\//) {
        is_comment = 1
      }
      # A rule of dashes above a Dockerfile stage is structure, so it ends a run uncounted.
      if (is_comment && rule_re != "" && line ~ rule_re) {
        if (run > 0) report()
        run = 0
        next
      }
      if (is_comment) {
        if (run == 0) start = FNR
        run++
        next
      }
      if (run > 0) report()
      run = 0
    }
    END {
      if (run > 0) report()
    }
  ' "$1"
}

if [ "${1:-}" != "--base" ] || [ "$#" -lt 2 ]; then
  echo "usage: $0 --base <ref> [file...]" >&2
  exit 2
fi
BASE="$2"
shift 2
# A base the clone never fetched would diff to nothing and pass.
git rev-parse --verify --quiet "${BASE}^{commit}" >/dev/null || {
  echo "comment-length.sh: base ${BASE} is not a commit here, fetch it first" >&2
  exit 2
}

top="$(git rev-parse --show-toplevel)"
cd "${top}"
if [ "$#" -eq 0 ]; then
  changed="$(git diff --name-only --diff-filter=d "${BASE}...HEAD")"
  while IFS= read -r path; do
    [ -z "${path}" ] || set -- "$@" "${path}"
  done <<EOF
${changed}
EOF
fi

status=0
for file in "$@"; do
  [ -f "${file}" ] || continue
  ranges="$(added_ranges "${file}")"
  [ -n "${ranges}" ] || continue
  report="$(runs_over_limit "${file}" "${ranges}")"
  if [ -n "${report}" ]; then
    echo "${report}"
    status=1
  fi
done
exit "${status}"
