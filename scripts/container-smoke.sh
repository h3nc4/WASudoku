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

# Called by CI against the runtime container, to prove each path answers what the edge answers.
# Usage: container-smoke.sh <base url>
set -eu

base="${1:?usage: container-smoke.sh <base url>}"
body="$(mktemp)"
trap 'rm -f "${body}"' EXIT
# Any 81-character board will do, since the server never reads the query.
shared_puzzle="$(printf '%081d' 0)"
failures=0

# expect <path> <status> <content type prefix> <text the body holds>
expect() {
  answer="$(curl -s -o "${body}" -w '%{http_code} %{content_type}' "${base}$1")"
  status="${answer%% *}"
  type="${answer#* }"
  case "${status} ${type}" in
  "$2 $3"*) ;;
  *)
    echo "fail: $1 answered ${status} ${type}, not $2 $3" >&2
    failures=$((failures + 1))
    return
    ;;
  esac
  if ! grep -qF "$4" "${body}"; then
    echo "fail: $1 has no \"$4\" in its body" >&2
    failures=$((failures + 1))
    return
  fi
  echo "ok: $1 answered ${status} ${type}"
}

# expect_header <path> <header> <value it holds>
expect_header() {
  value="$(curl -s -o /dev/null -D - "${base}$1" | tr -d '\r' | grep -i "^$2:" | cut -d ' ' -f 2-)"
  if [ "${value}" != "$3" ]; then
    echo "fail: $1 sent $2 '${value}', not '$3'" >&2
    failures=$((failures + 1))
    return
  fi
  echo "ok: $1 sent $2"
}

expect / 200 text/html '<div role="grid" id="board"'
expect "/?p=${shared_puzzle}" 200 text/html '<div role="grid" id="board"'
expect /robots.txt 200 text/plain 'Sitemap:'
# The SPA fallback used to answer with index.html, which the edge then appended to its managed block.
if grep -qF '<' "${body}"; then
  echo "fail: /robots.txt holds markup" >&2
  failures=$((failures + 1))
fi
expect /sitemap.xml 200 application/xml '<urlset'
expect /no-such-page 404 text/html 'Page not found'
expect /.well-known/no-such-file.json 404 text/html 'Page not found'
expect_header / Cache-Control no-cache
expect_header /sw.js Cache-Control no-cache
expect_header /no-such-page X-Content-Type-Options nosniff
expect_header /no-such-page Cross-Origin-Opener-Policy same-origin
expect_header /no-such-page Cross-Origin-Resource-Policy same-origin

exit "$((failures > 0))"
