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

# Prints nginx.conf on one line, with the report-only policy that the build wrote into _headers.
# Usage: nginx-conf.sh <nginx.conf> <_headers>. A _headers without that policy leaves it empty.
set -eu

conf="${1:?usage: nginx-conf.sh <nginx.conf> <_headers>}"
headers="${2:?usage: nginx-conf.sh <nginx.conf> <_headers>}"

policy="$(sed -n 's/^  Content-Security-Policy-Report-Only: //p' "${headers}")"
case "${policy}" in
*'|'* | *'"'* | *'&'* | *\\*)
  echo "nginx-conf.sh: the policy holds a character sed or nginx would read" >&2
  exit 1
  ;;
*) ;;
esac

sed -E -e '/^[[:space:]]*#/d' -e '/^[[:space:]]*$/d' -e "s|@CSP_REPORT_ONLY@|${policy}|" "${conf}" |
  tr -d '\n' | tr -s ' '
