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

# Prints the brotli q11 size of each asset class a first visit downloads, against one limit table.
# Usage: budget.sh [--enforce] [dist-dir]. Without --enforce an overrun warns and exits 0.
set -eu

# Bytes on the wire, 1000 to the kilobyte as Vite counts. Each limit is the dist-next size plus 10%
# rounded up to 100 bytes, or a provisional one for a class dist-next does not hold yet.
LIMIT_HTML=5600
LIMIT_CSS=9000
LIMIT_INITIAL_JS=25000
LIMIT_FONTS=32600
LIMIT_WASM=30000
LIMIT_ICONS=1500
LIMIT_SW=800
BYTES_PER_KB=1000
BROTLI_QUALITY=11

enforce=0
if [ "${1:-}" = "--enforce" ]; then
  enforce=1
  shift
fi
dist="${1:-dist}"
dist="${dist%/}"
page="${dist}/index.html"
if [ ! -f "${page}" ]; then
  echo "budget.sh: ${page} not found, build first" >&2
  exit 2
fi

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

# Splits the page into its markup and the text of its inline style elements.
awk -v html="${work}/page.html" -v css="${work}/page.css" '
  { s = s $0 "\n" }
  END {
    while (match(s, /<[sS][tT][yY][lL][eE]([[:space:]][^>]*)?>/)) {
      rest = substr(s, RSTART + RLENGTH)
      close_at = index(tolower(rest), "</style>")
      if (close_at == 0) break
      out = out substr(s, 1, RSTART + RLENGTH - 1)
      sheet = sheet substr(rest, 1, close_at - 1)
      s = substr(rest, close_at)
    }
    printf "%s", out s >html
    printf "%s", sheet >css
  }' "${page}"

# One tag per line, so an attribute can be matched within the tag that holds it.
tr '>' '\n' <"${page}" >"${work}/tags"
grep -i '^[[:space:]]*<link[[:space:]]' "${work}/tags" >"${work}/links" || true

# Turns the URLs on stdin into paths under ${dist}, dropping external ones and any query.
to_paths() {
  sed -e 's/[?#].*//' -e '/^[a-z][a-z0-9+.-]*:/d' -e '/^\/\//d' -e 's|^\./||' -e 's|^/||' \
    -e "s|^|${dist}/|"
}

# The value of attribute $1 in each tag on stdin, double, single or unquoted.
attr() {
  sed -n -e "s/.*[[:space:]]$1=\"\([^\"]*\)\".*/\1/p" \
    -e "t" -e "s/.*[[:space:]]$1='\([^']*\)'.*/\1/p" \
    -e "t" -e "s/.*[[:space:]]$1=\([^[:space:]\"'][^[:space:]]*\).*/\1/p"
}

# The link tags whose rel holds one of the tokens in the alternation $1.
rel() {
  grep -iE "[[:space:]]rel=[\"']?([a-z-]+ )*($1)([\"' ]|\$)" "${work}/links" || true
}

{
  grep -i '^[[:space:]]*<script[[:space:]]' "${work}/tags" | attr src
  rel modulepreload | attr href
} | to_paths >"${work}/initial"

# A browser fetches the manifest and the icon without sizes, and the sized ones only to install.
rel manifest | attr href | to_paths >"${work}/manifests"
rel icon | grep -viE "[[:space:]]sizes=[\"']?[0-9]" | attr href | to_paths >"${work}/icons"
cat "${work}/manifests" >>"${work}/icons"
{
  rel icon | grep -iE "[[:space:]]sizes=[\"']?[0-9]" | attr href
  rel 'apple-touch-icon|apple-touch-icon-precomposed' | attr href
  while IFS= read -r manifest; do
    if [ -f "${manifest}" ]; then
      grep -oE '"src"[[:space:]]*:[[:space:]]*"[^"]+"' "${manifest}" | sed -E 's/.*"([^"]+)"$/\1/'
    fi
  done <"${work}/manifests"
} | to_paths >"${work}/install"

find "${dist}" -type f | sort >"${work}/files"
: >"${work}/workers"
grep '\.js$' "${work}/files" | while IFS= read -r file; do
  grep -oE "new (Shared)?Worker\((new URL\()?[\"'\`][^\"'\`]+" "${file}" |
    sed -E "s/.*[\"'\`]//" | to_paths >>"${work}/workers"
done

# The order decides a file that two rules match, so a main bundle naming the wasm stays initial.
classify() {
  case "$1" in
  "${dist}/sw.js") echo sw ;;
  *.css) echo css ;;
  *.woff2 | *.woff | *.ttf | *.otf) echo fonts ;;
  *.wasm) echo wasm ;;
  *.js)
    if grep -qxF -- "$1" "${work}/initial"; then
      echo initial_js
    elif grep -qxF -- "$1" "${work}/workers" || grep -q '\.wasm' "$1"; then
      echo wasm
    else
      echo other
    fi
    ;;
  *)
    if grep -qxF -- "$1" "${work}/icons"; then
      echo icons
    elif grep -qxF -- "$1" "${work}/install"; then
      echo install
    else
      echo other
    fi
    ;;
  esac
}

# Appends a row for class $1 holding the brotli size of file $2, shown as name $3.
record() {
  size="$(brotli -q "${BROTLI_QUALITY}" -c -- "$2" | wc -c)"
  printf '%s %s %s\n' "$1" "${size}" "$3" >>"${work}/sizes"
}

: >"${work}/sizes"
record html "${work}/page.html" index.html
if [ -s "${work}/page.css" ]; then
  record css "${work}/page.css" index.html:style
fi
grep -vxF -- "${page}" "${work}/files" | while IFS= read -r file; do
  class="$(classify "${file}")"
  record "${class}" "${file}" "${file#"${dist}/"}"
done

kb() {
  awk -v b="$1" -v k="${BYTES_PER_KB}" 'BEGIN { printf "%.1f KB", b / k }'
}

printf '%-12s %10s  %s\n' class brotli file
sort -k1,1 -k2,2nr "${work}/sizes" | while read -r class size file; do
  shown="$(kb "${size}")"
  printf '%-12s %10s  %s\n' "${class}" "${shown}" "${file}"
done
echo

over=0
printf '%-12s %10s %10s\n' class total limit
for entry in html:"${LIMIT_HTML}" css:"${LIMIT_CSS}" initial_js:"${LIMIT_INITIAL_JS}" \
  fonts:"${LIMIT_FONTS}" wasm:"${LIMIT_WASM}" icons:"${LIMIT_ICONS}" sw:"${LIMIT_SW}" install: \
  other:; do
  class="${entry%%:*}"
  limit="${entry#*:}"
  total="$(awk -v c="${class}" '$1 == c { t += $2 } END { print t + 0 }' "${work}/sizes")"
  shown="$(kb "${total}")"
  if [ -z "${limit}" ]; then
    printf '%-12s %10s %10s\n' "${class}" "${shown}" none
    continue
  fi
  cap="$(kb "${limit}")"
  if [ "${total}" -gt "${limit}" ]; then
    printf '%-12s %10s %10s  over\n' "${class}" "${shown}" "${cap}"
    echo "warning: ${class} is ${shown}, over its ${cap} budget" >&2
    over=1
  else
    printf '%-12s %10s %10s\n' "${class}" "${shown}" "${cap}"
  fi
done

if [ "${over}" -eq 1 ] && [ "${enforce}" -eq 1 ]; then
  exit 1
fi
