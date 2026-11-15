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

"""Checks which files scripts/font-subset.py reads characters from, on a throwaway tree."""

import importlib.util
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "font-subset.py"
SPEC = importlib.util.spec_from_file_location("font_subset", SCRIPT)
font_subset = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(font_subset)

# One character per file, each above ASCII so only the file walk can bring it in.
SOURCES = {
    "src/components/Footer.astro": "–",
    "src/layouts/Base.astro": "·",
    "src/ui/grid.ts": "—",
    "src/styles/app.css": "•",
}
SKIPPED = {
    "src/ui/grid.test.ts": "ñ",
    "src/test/page.astro": "ü",
    "src/notes.md": "ç",
}


class UiCharacters(unittest.TestCase):
    def setUp(self) -> None:
        self.tree = tempfile.TemporaryDirectory()
        root = Path(self.tree.name)
        for name, char in {**SOURCES, **SKIPPED}.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(char, encoding="utf-8")
        self.saved = font_subset.ROOT, font_subset.UI_SOURCES
        font_subset.ROOT = root
        font_subset.UI_SOURCES = [root / "src"]

    def tearDown(self) -> None:
        font_subset.ROOT, font_subset.UI_SOURCES = self.saved
        self.tree.cleanup()

    def test_reads_every_ui_source(self) -> None:
        found = font_subset.ui_characters()
        for name, char in SOURCES.items():
            with self.subTest(name):
                self.assertIn(ord(char), found)

    def test_skips_tests_and_other_files(self) -> None:
        found = font_subset.ui_characters()
        for name, char in SKIPPED.items():
            with self.subTest(name):
                self.assertNotIn(ord(char), found)


if __name__ == "__main__":
    unittest.main()
