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

# Runs the parity harness in the Playwright image the e2e suite pins, one build against another.
# Usage: parity.sh <reference> <candidate> [output dir], each build a dist directory or a URL.
set -eu
cd "$(dirname "$0")/../"

usage='usage: parity.sh <reference dist or url> <candidate dist or url> [output dir]'
ref="${1:?${usage}}"
candidate="${2:?${usage}}"
out="${3:-parity-out}"
mkdir -p "${out}"
out="$(cd "${out}" && pwd)"
root="$(pwd)"
version="$(sed -n 's/.*"@playwright\/test": "\([^"]*\)".*/\1/p' package.json)"

uid="$(id -u)"
gid="$(id -g)"
set -- -v "${root}:${root}:ro" -v "${out}:/parity/out"
# A directory is mounted read-only under /parity, and a URL passes through as it is.
case "${ref}" in
http://* | https://*) ref_source="${ref}" ;;
*)
  ref_dir="$(cd "${ref}" && pwd)"
  set -- "$@" -v "${ref_dir}:/parity/ref:ro"
  ref_source=/parity/ref
  ;;
esac
case "${candidate}" in
http://* | https://*) candidate_source="${candidate}" ;;
*)
  candidate_dir="$(cd "${candidate}" && pwd)"
  set -- "$@" -v "${candidate_dir}:/parity/candidate:ro"
  candidate_source=/parity/candidate
  ;;
esac

exec docker run --rm --name "wasudoku-parity-$$" --shm-size=1gb "$@" -w "${root}" \
  --user "${uid}:${gid}" -e HOME=/tmp -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -e PARITY_REF="${ref_source}" -e PARITY_CANDIDATE="${candidate_source}" -e PARITY_OUT=/parity/out \
  -e PARITY_ONLY -e PARITY_SCENARIOS -e PARITY_KEEP \
  "mcr.microsoft.com/playwright:v${version}-noble" node parity/main.ts
