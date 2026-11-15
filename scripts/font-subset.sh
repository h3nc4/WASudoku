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
set -eu

cd "$(dirname "$0")/../"

uid="$(id -u)"
gid="$(id -g)"
root="$(pwd)"
image="python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b"

exec docker run --rm --user "${uid}:${gid}" -e HOME=/tmp \
  -v "${root}:/w" -w /w --entrypoint /bin/sh "${image}" -c '
    set -e
    pip install -q --user --no-cache-dir --disable-pip-version-check --no-warn-script-location -r scripts/font-requirements.txt
    exec python scripts/font-subset.py "$@"
  ' font-subset "$@"
