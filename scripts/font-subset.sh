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

# Runs scripts/font-subset.py on pinned Python packages, and `--check` verifies the checked-in fonts.
# `--test` runs scripts/font-subset.test.py instead, which checks the files the subset reads.
set -eu

cd "$(dirname "$0")/../"

uid="$(id -u)"
gid="$(id -g)"
root="$(pwd)"
image="python:3.15-slim@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928"

exec docker run --rm --user "${uid}:${gid}" -e HOME=/tmp \
  -v "${root}:/w" -w /w --entrypoint /bin/sh "${image}" -c '
    set -e
    pip install -q --user --no-cache-dir --disable-pip-version-check --no-warn-script-location -r scripts/font-requirements.txt
    if [ "${1:-}" = --test ]; then exec python scripts/font-subset.test.py; fi
    exec python scripts/font-subset.py "$@"
  ' font-subset "$@"
