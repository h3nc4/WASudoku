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

# Runs scripts/budget.sh against a throwaway dist, checking each class rule and the exit status.
set -eu

SCRIPT="$(CDPATH="" cd -- "$(dirname -- "$0")" && pwd)/budget.sh"
DIST="$(mktemp -d)"
trap 'rm -rf "${DIST}"' EXIT
failures=0
OVER_CSS_BYTES=20000
SCREENSHOT_BYTES=20000
# Random bytes whose base64 compresses to about 7 KB, over the HTML limit and under the CSS one.
INLINE_CSS_BYTES=7000
OVER_INLINE_CSS_BYTES=12000

# Writes the page with an inline style of base64 from $1 random bytes, which brotli cannot shrink.
write_page() {
  sheet="$(head -c "$1" /dev/urandom | base64 | tr -d '\n')"
  cat >"${DIST}/index.html" <<HTML
<!doctype html><html><head>
<script>document.documentElement.dataset.theme = "dark"</script>
<style>.x{background:url(${sheet})}</style>
<link rel="stylesheet" href="/assets/a.css">
<link rel='modulepreload' href='./assets/dep.js?v=1'>
<link rel=icon href=/favicon.svg>
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="apple-touch-icon" href="/touch.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/assets/f.woff2" as="font">
</head><body><script type="module" src="/assets/main.js"></script></body></html>
HTML
}

mkdir -p "${DIST}/assets" "${DIST}/shots"
write_page "${INLINE_CSS_BYTES}"
cat >"${DIST}/assets/main.js" <<'JS'
new Worker(`/assets/w.js`,{type:`module`});import("./lazy.js")
JS
cat >"${DIST}/manifest.webmanifest" <<'JSON'
{
  "icons": [{ "src": "/icon-512.png", "sizes": "512x512" }],
  "screenshots": [{"src":"shots/wide.png"}]
}
JSON
echo 'export const dep = 1' >"${DIST}/assets/dep.js"
echo 'self.onmessage = () => {}' >"${DIST}/assets/w.js"
echo 'fetch(new URL("x.wasm", import.meta.url))' >"${DIST}/assets/glue.js"
echo 'export const lazy = 1' >"${DIST}/assets/lazy.js"
printf '\0asm' >"${DIST}/assets/x.wasm"
echo 'body{}' >"${DIST}/assets/a.css"
echo 'font' >"${DIST}/assets/f.woff2"
echo '<svg/>' >"${DIST}/favicon.svg"
echo 'png' >"${DIST}/icon-192.png"
echo 'png' >"${DIST}/icon-512.png"
echo 'png' >"${DIST}/touch.png"
head -c "${SCREENSHOT_BYTES}" /dev/urandom >"${DIST}/shots/wide.png"
echo 'png' >"${DIST}/preview.png"
echo 'self.addEventListener("fetch", () => {})' >"${DIST}/sw.js"
echo 'User-agent: *' >"${DIST}/robots.txt"
echo '<!doctype html>' >"${DIST}/404.html"

# Runs the check with arguments $3... and expects exit $2, leaving its output in ${out}.
run() {
  name="$1"
  want="$2"
  shift 2
  status=0
  out="$(sh "${SCRIPT}" "$@" 2>&1)" || status=$?
  if [ "${status}" -eq "${want}" ]; then
    echo "ok   ${name}"
  else
    echo "FAIL ${name}: exit ${status}, expected ${want}"
    failures=$((failures + 1))
  fi
}

# Expects a warning about class $1 when $2 is yes, and none when it is no.
expect_warning() {
  found=no
  if printf '%s\n' "${out}" | grep -q "^warning: $1 is"; then
    found=yes
  fi
  if [ "${found}" = "$2" ]; then
    echo "ok   warning about $1: $2"
  else
    echo "FAIL warning about $1: ${found}, expected $2"
    failures=$((failures + 1))
  fi
}

# Expects the row for file $2 to name class $1.
expect_class() {
  if printf '%s\n' "${out}" | grep -qE "^$1 +[0-9.]+ KB  $2\$"; then
    echo "ok   $2 is $1"
  else
    echo "FAIL $2 is not $1"
    failures=$((failures + 1))
  fi
}

run under_budget_passes_enforced 0 --enforce "${DIST}"
expect_class html index.html
expect_class css index.html:style
expect_class css assets/a.css
expect_class initial_js assets/main.js
expect_class initial_js assets/dep.js
expect_class wasm assets/w.js
expect_class wasm assets/glue.js
expect_class wasm assets/x.wasm
expect_class fonts assets/f.woff2
expect_class icons favicon.svg
expect_class icons manifest.webmanifest
expect_class install icon-192.png
expect_class install icon-512.png
expect_class install touch.png
expect_class install shots/wide.png
expect_class sw sw.js
expect_class other assets/lazy.js
expect_class other preview.png
expect_class other 404.html
expect_class other robots.txt
expect_warning html no

write_page "${OVER_INLINE_CSS_BYTES}"
run over_inline_css_fails_enforced 1 --enforce "${DIST}"
expect_warning css yes
expect_warning html no

write_page "${INLINE_CSS_BYTES}"
head -c "${OVER_CSS_BYTES}" /dev/urandom >"${DIST}/assets/a.css"
run over_budget_warns 0 "${DIST}"
expect_warning css yes
run over_budget_fails_enforced 1 --enforce "${DIST}"

rm "${DIST}/index.html"
run missing_page_fails 2 "${DIST}"

[ "${failures}" -eq 0 ]
