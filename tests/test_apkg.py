"""Tests for the mobile ``.apkg`` builder (``tools/build_apkg.py``).

The builder itself only needs the standard library; importing the ``anki``
package is deferred until a real build runs, so the pure-logic tests here run
even where Anki is not installed.
"""

import importlib.util
import json
import os
from pathlib import Path
import re
import tempfile
import unittest
from zipfile import ZIP_DEFLATED, ZipFile


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BUILD_PATH = PROJECT_ROOT / "tools" / "build_apkg.py"


def load_builder():
    spec = importlib.util.spec_from_file_location("quizify_build_apkg", BUILD_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


builder = load_builder()
HAS_ANKI = importlib.util.find_spec("anki") is not None


class ApkgBuilderTest(unittest.TestCase):
    def test_runtime_assets_come_from_the_validated_manifest(self):
        assets = builder.media_manifest()
        names = {path.name for path in assets}
        self.assertIn("_quizify.js", names)
        self.assertIn("_quizify.css", names)
        self.assertIn("_quizify-i18n.js", names)
        self.assertIn("_persistence.js", names)
        self.assertTrue(any("katex" in name and name.endswith(".woff2") for name in names))
        # The manifest is the single source of truth for what ships.
        manifest = json.loads(
            (builder.ADDON_ROOT / "media-manifest.json").read_text(encoding="utf-8")
        )
        self.assertEqual(names, set(manifest["files"]))
        for path in assets:
            self.assertTrue(path.is_file(), path)

    def test_templates_are_reused_from_the_addon_notetype_module(self):
        source = BUILD_PATH.read_text(encoding="utf-8")
        # Guard against a future regression that copies the templates instead of
        # reusing the add-on's canonical builder.
        self.assertIn("notetype.template_html", source)
        self.assertIn("notetype.DEFAULT_CSS", source)

    def test_sample_deck_exercises_the_documented_syntax(self):
        combined = "\n".join(front + back for front, back in builder.SAMPLES)
        self.assertGreaterEqual(len(builder.SAMPLES), 5)
        for marker in (";;;", "{{", "$$", "```", ":::", "===", "[[", "> "):
            self.assertIn(marker, combined, marker)
        self.assertIn(":::: recite", combined)
        self.assertIn(":::: occlusion", combined)
        self.assertIn("_quizify-occlusion-sample.png", combined)

    def test_sample_deck_ships_the_media_every_card_references(self):
        shipped = {path.name for path in builder.extra_assets()}
        self.assertIn("_quizify-occlusion-sample.png", shipped)
        self.assertIn("_quizify-sample.png", shipped)
        self.assertIn("_quizify-sample.mp3", shipped)

        # Every media filename mentioned by a sample card must be packaged.
        combined = "\n".join(front + back for front, back in builder.SAMPLES)
        referenced = set(re.findall(r"_[\w.-]+\.(?:png|jpg|jpeg|gif|svg|mp3|m4a|ogg|wav)", combined))
        self.assertTrue(referenced, "sample cards should reference bundled media")
        self.assertEqual(referenced - shipped, set())

    def test_occlusion_sample_regions_stay_inside_the_image(self):
        combined = "\n".join(front for front, _ in builder.SAMPLES)
        blocks = re.findall(r"::::[ \t]+occlusion[^\n]*\n(.*?)\n::::", combined, re.S)
        self.assertTrue(blocks, "the sample deck should include occlusion blocks")
        region_line = re.compile(
            r"^\s*(\d+)\.\s*(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\s*(.*)$"
        )
        checked = 0
        for block in blocks:
            for line in block.splitlines():
                if not line.strip():
                    continue
                match = region_line.match(line)
                # A block may also carry an image or a caption; only lines that
                # look like `<number>. x,y,w,h` are treated as regions.
                if not re.match(r"^\s*\d+\s*\.", line):
                    continue
                self.assertIsNotNone(match, f"not a valid region line: {line!r}")
                _, x, y, w, h, _label = match.groups()
                x, y, w, h = (float(value) for value in (x, y, w, h))
                self.assertGreater(w, 0)
                self.assertGreater(h, 0)
                self.assertLessEqual(x + w, 100.0001)
                self.assertLessEqual(y + h, 100.0001)
                checked += 1
        self.assertGreaterEqual(checked, 5)

    def test_scan_block_lists_every_asset_for_the_media_scanner(self):
        assets = builder.package_assets()
        block = builder.scan_block(assets)
        self.assertIn(builder.MOBILE_ASSETS_COMMENT, block)
        # Anki only scans styling for "_"-prefixed media, so every asset that
        # must travel with the mobile package has to be listed.
        for path in assets:
            self.assertIn(path.name, block)
            self.assertTrue(path.name.startswith("_"), path.name)

    def test_verify_package_media_rejects_incomplete_archives(self):
        assets = builder.media_manifest()
        with tempfile.TemporaryDirectory() as tmp:
            apkg = Path(tmp) / "quizify.apkg"
            with ZipFile(apkg, "w", ZIP_DEFLATED) as archive:
                archive.writestr("meta", b"\x08\x02")
                archive.writestr(
                    "media", json.dumps({p.name: p.name for p in assets})
                )
            builder.verify_package_media(apkg, assets)  # complete, no raise

            partial = Path(tmp) / "partial.apkg"
            with ZipFile(partial, "w", ZIP_DEFLATED) as archive:
                archive.writestr("meta", b"\x08\x02")
                archive.writestr("media", json.dumps({"0": "_quizify.js"}))
            with self.assertRaises(RuntimeError):
                builder.verify_package_media(partial, assets)


@unittest.skipUnless(HAS_ANKI, "the 'anki' package is required for an end-to-end build")
class ApkgBuildTest(unittest.TestCase):
    def test_build_produces_an_importable_mobile_package(self):
        from anki.collection import Collection
        from anki import import_export_pb2

        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "quizify_markdown.apkg"
            rc = builder.main(["--out", str(out)])
            self.assertEqual(rc, 0)
            self.assertTrue(out.is_file())

            col = Collection(str(Path(tmp) / "collection.anki2"))
            try:
                col.import_anki_package(
                    import_export_pb2.ImportAnkiPackageRequest(
                        package_path=str(out)
                    )
                )
                model = col.models.by_name(builder.NOTE_TYPE_NAME)
                self.assertIsNotNone(model)
                self.assertEqual(
                    [field["name"] for field in model["flds"]], ["Front", "Back"]
                )
                qfmt = model["tmpls"][0]["qfmt"]
                self.assertIn("_quizify.js", qfmt)
                self.assertIn("quizify-managed-template", qfmt)
                self.assertIn("data-quizify-first-paint", qfmt)
                self.assertIn("quizify-managed-css", model["css"])
                self.assertIn(builder.MOBILE_ASSETS_COMMENT, model["css"])

                media = set(os.listdir(col.media.dir()))
                self.assertIn("_quizify.js", media)
                self.assertIn("_quizify.css", media)
                self.assertTrue(any("katex" in name for name in media))
                self.assertIn("_quizify-occlusion-sample.png", media)
                notes = col.db.all("select flds from notes")
                joined = "\n".join(row[0] for row in notes)
                self.assertIn(":::: occlusion", joined)
                self.assertEqual(
                    col.db.scalar("select count(*) from notes"), len(builder.SAMPLES)
                )
            finally:
                col.close()


if __name__ == "__main__":
    unittest.main()
