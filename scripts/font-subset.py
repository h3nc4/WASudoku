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

"""Cuts Recursive down to the axes, weights and characters the UI uses, into src/assets/fonts.

With --check it fails unless a fresh build matches the checked-in files byte for byte."""

import base64
import hashlib
import io
import os
import sys
import tarfile
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "assets" / "fonts"

SOURCE_URL = "https://registry.npmjs.org/@fontsource-variable/recursive/-/recursive-5.3.0.tgz"
SOURCE_SHA512 = "4B4/lWCVeZgdbpJdIIU1sOVO/ECjjM673ohuxvyQ6uCK41TPlGzKRNokKY84noUgGYnpwc//MW4k2KrOMY19jQ=="
SOURCE_MEMBER = "package/files/recursive-latin-full-normal.woff2"
# The release time of that package, so head.modified and the output bytes never change.
SOURCE_DATE_EPOCH = 1784433118

# A character that UI text in these files gains joins the subset on the next build.
UI_SOURCES = [ROOT / "index.html", ROOT / "src"]
UI_SUFFIXES = {".ts", ".tsx", ".css", ".rs", ".html", ".astro"}
SKIPPED_PARTS = {"test", "tests", "__mocks__", "target", "pkg"}

PRINTABLE_ASCII = set(range(0x20, 0x7F))
PENCIL_CHARACTERS = {ord(" ")} | {ord(digit) for digit in "0123456789"}

LAYOUT_FEATURES = ["kern", "rvrn"]
MAIN_WEIGHTS = (400, 800)
PENCIL_WEIGHTS = (450, 700)

OUTPUTS = {
    "main": OUT / "recursive-main.woff2",
    "pencil": OUT / "recursive-casual-digits.woff2",
}


def fetch_source() -> bytes:
    with urllib.request.urlopen(SOURCE_URL) as response:
        archive = response.read()
    digest = base64.b64encode(hashlib.sha512(archive).digest()).decode()
    if digest != SOURCE_SHA512:
        sys.exit(f"{SOURCE_URL} has sha512 {digest}, expected {SOURCE_SHA512}")
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        member = tar.extractfile(SOURCE_MEMBER)
        if member is None:
            sys.exit(f"{SOURCE_MEMBER} is missing from {SOURCE_URL}")
        return member.read()


def is_ui_source(path: Path) -> bool:
    parts = set(path.relative_to(ROOT).parts)
    return (
        path.is_file()
        and path.suffix in UI_SUFFIXES
        and ".test." not in path.name
        and not parts & SKIPPED_PARTS
    )


def ui_characters() -> set[int]:
    files = []
    for source in UI_SOURCES:
        files += [source] if source.is_file() else sorted(source.rglob("*"))
    found = set(PRINTABLE_ASCII)
    for path in filter(is_ui_source, files):
        found |= {ord(char) for char in path.read_text(encoding="utf-8") if ord(char) > 0x7E}
    return found


def plain(font: TTFont) -> TTFont:
    """A fresh copy of the font as sfnt, since the instancer edits its input in place."""
    buffer = io.BytesIO()
    font.flavor = None
    font.save(buffer)
    return TTFont(io.BytesIO(buffer.getvalue()))


def instance(font: TTFont, **axes) -> TTFont:
    return instancer.instantiateVariableFont(plain(font), axes)


def woff2(font: TTFont, unicodes: set[int]) -> bytes:
    font = plain(font)
    options = subset.Options()
    options.layout_features = LAYOUT_FEATURES
    options.name_IDs = []
    options.notdef_outline = True
    options.drop_tables += ["STAT"]
    # Chromium on Linux autohints a font without prep, which moved 4,865 pixels of text.
    options.hinting = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=sorted(unicodes))
    subsetter.subset(font)
    font.flavor = "woff2"
    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue()


def build() -> dict[str, bytes]:
    source = TTFont(io.BytesIO(fetch_source()))
    covered = set(source.getBestCmap())
    wanted = ui_characters()
    for char in sorted(wanted - covered):
        print(f"U+{char:04X} is not in Recursive, a fallback font draws it", file=sys.stderr)
    upright = instance(source, slnt=0, CRSV=0)
    upright = instance(upright, wght=MAIN_WEIGHTS)
    return {
        "main": woff2(instance(upright, CASL=0), wanted & covered),
        "pencil": woff2(instance(upright, CASL=1, MONO=0, wght=PENCIL_WEIGHTS), PENCIL_CHARACTERS),
    }


def main() -> None:
    os.environ["SOURCE_DATE_EPOCH"] = str(SOURCE_DATE_EPOCH)
    check = sys.argv[1:] == ["--check"]
    stale = []
    for name, data in build().items():
        path = OUTPUTS[name]
        digest = hashlib.sha256(data).hexdigest()
        print(f"{path.relative_to(ROOT)}  {len(data)} bytes  sha256 {digest}")
        if not check:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        elif not path.is_file() or path.read_bytes() != data:
            stale.append(str(path.relative_to(ROOT)))
    if stale:
        sys.exit(f"{', '.join(stale)} differ from a fresh build, run scripts/font-subset.sh")


if __name__ == "__main__":
    main()
