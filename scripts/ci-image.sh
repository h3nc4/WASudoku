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

# Prints the image CI runs in, which is the sibling of the one the dev container pins.
#
# Two images come out of one version here: the dev container an editor opens, named by
# .devcontainer.json, and the leaner one CI runs in, built from docker/ci.Dockerfile. They
# are released together and share the version, so the pin is the only place the number
# lives and this derives the rest of the name from it.
set -eu

cd "$(dirname "$0")/../"

repo="$(./scripts/devcontainer-image.sh -r)"
tag="$(./scripts/devcontainer-image.sh -t)"

case "${repo}" in
  *-dev) ;;
  *)
    echo "the image in .devcontainer.json is '${repo}', which does not end in -dev," \
      "so the CI image beside it cannot be named" >&2
    exit 1
    ;;
esac

printf '%s-ci:%s\n' "${repo%-dev}" "${tag}"
