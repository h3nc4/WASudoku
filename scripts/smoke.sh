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

# Called by CI after a deploy to prove the site at <base-url> serves the build in <dist-dir>.
# Usage: smoke.sh <base-url> [dist-dir]
set -eu

base_url="${1:?usage: smoke.sh <base-url> [dist-dir]}"
base_url="${base_url%/}"
dist_dir="${2:-dist}"

# The edge propagates a deploy over minutes, and GitHub Pages caches HTML for max-age=600.
timeout_seconds="${SMOKE_TIMEOUT_SECONDS:-660}"
retry_interval_seconds=10
request_timeout_seconds=30
root_element='<div id="root">'

script_path="$(sed -n 's|.*<script type="module"[^>]* src="\(/assets/[^"]*\.js\)".*|\1|p' "${dist_dir}/index.html")"
if [ -z "${script_path}" ]; then
  echo "${dist_dir}/index.html names no hashed module script" >&2
  exit 1
fi

wasm_path=""
for wasm_file in "${dist_dir}"/assets/*.wasm; do
  if [ -n "${wasm_path}" ] || [ ! -f "${wasm_file}" ]; then
    echo "${dist_dir}/assets must hold exactly one .wasm file" >&2
    exit 1
  fi
  wasm_path="/assets/${wasm_file##*/}"
done

work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT
body="${work_dir}/body"

# Prints the status and the media type of <path>, and leaves the response body in ${body}.
fetch() {
  curl -sS -o "${body}" --max-time "${request_timeout_seconds}" \
    -w '%{http_code} %{content_type}' "${base_url}$1" || true
}

# Leaves the first failed check in ${failure}, or empties it when every check passes.
check_all() {
  failure=""
  response="$(fetch /)"
  case "${response}" in
    "200 text/html"*) ;;
    *) failure="/ answered '${response}', not 200 text/html" && return ;;
  esac
  if ! grep -qF "${root_element}" "${body}"; then
    failure="/ has no ${root_element}" && return
  fi
  if ! grep -qF "src=\"${script_path}\"" "${body}"; then
    failure="/ does not load ${script_path}, so it is not this build" && return
  fi

  response="$(fetch "${script_path}")"
  case "${response}" in
    "200 text/javascript"* | "200 application/javascript"*) ;;
    *) failure="${script_path} answered '${response}', not 200 JavaScript" && return ;;
  esac

  response="$(fetch "${wasm_path}")"
  if [ "${response%%;*}" != "200 application/wasm" ]; then
    failure="${wasm_path} answered '${response}', not 200 application/wasm" && return
  fi

  response="$(fetch /sw.js)"
  case "${response}" in
    "200 "*) ;;
    *) failure="/sw.js answered '${response}', not 200" && return ;;
  esac

  response="$(fetch /manifest.json)"
  case "${response}" in
    "200 "*) ;;
    *) failure="/manifest.json answered '${response}', not 200" && return ;;
  esac
  if ! jq empty "${body}" 2>/dev/null; then
    failure="/manifest.json does not parse as JSON" && return
  fi
}

deadline=$(($(date +%s) + timeout_seconds))
check_all
while [ -n "${failure}" ]; do
  now="$(date +%s)"
  if [ "${now}" -ge "${deadline}" ]; then
    echo "smoke test of ${base_url} failed after ${timeout_seconds}s: ${failure}" >&2
    exit 1
  fi
  echo "waiting for ${base_url}: ${failure}"
  sleep "${retry_interval_seconds}"
  check_all
done
echo "${base_url} serves ${script_path} and ${wasm_path}"
