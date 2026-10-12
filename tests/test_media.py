import hashlib
import json
from pathlib import Path
import tempfile
import types
import unittest

from helpers import load_module


media_module = load_module("media")
runtime_media = load_module("runtime_media")


class FakeMedia:
    """Minimal MediaManager stand-in backed by a real directory."""

    def __init__(self, directory, supports_write_data=True):
        self.directory = Path(directory)
        self.trashed = []
        self.added = []
        if supports_write_data:
            self.write_data = self._write_data

    def dir(self):
        return str(self.directory)

    def trash_files(self, names):
        self.trashed.extend(names)
        for name in names:
            (self.directory / name).unlink(missing_ok=True)

    def add_file(self, source):
        source = Path(source)
        (self.directory / source.name).write_bytes(source.read_bytes())
        self.added.append(source.name)
        return source.name

    def _write_data(self, name, data):
        (self.directory / name).write_bytes(data)
        self.added.append(name)
        return name


def addon_dir(root: Path, payload: bytes) -> Path:
    addon = root / "addon"
    addon.mkdir(exist_ok=True)
    (addon / "_quizify.js").write_bytes(payload)
    (addon / "media-manifest.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "files": {
                    "_quizify.js": {
                        "bytes": len(payload),
                        "sha256": hashlib.sha256(payload).hexdigest(),
                    }
                },
            }
        ),
        encoding="utf-8",
    )
    return addon


class MediaTest(unittest.TestCase):
    def test_verifies_hashes_and_only_syncs_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            addon = addon_dir(root, b"v1")
            target = root / "media"
            target.mkdir()
            expected = runtime_media.hashed_name(
                "_quizify.js", hashlib.sha256(b"v1").hexdigest()
            )
            fake = FakeMedia(target)
            mw = types.SimpleNamespace(col=types.SimpleNamespace(media=fake))

            self.assertEqual(media_module.sync_media(mw, addon), [expected])
            self.assertTrue((target / expected).is_file())
            self.assertEqual(media_module.sync_media(mw, addon), [])

            (addon / "_quizify.js").write_bytes(b"bad")
            with self.assertRaises(ValueError):
                media_module.sync_media(mw, addon)

    def test_a_new_runtime_lands_under_a_new_name(self):
        """Anki refuses to replace media, so a changed runtime needs a new name."""

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            addon = addon_dir(root, b"v1")
            target = root / "media"
            target.mkdir()
            fake = FakeMedia(target)
            mw = types.SimpleNamespace(col=types.SimpleNamespace(media=fake))

            first = media_module.sync_media(mw, addon)
            addon_dir(root, b"v2")
            second = media_module.sync_media(mw, addon)

            self.assertNotEqual(first, second)
            # The superseded copy stays behind: a client that has not picked up
            # the new template yet must keep working.
            self.assertTrue((target / first[0]).is_file())
            self.assertTrue((target / second[0]).is_file())
            self.assertEqual((target / second[0]).read_bytes(), b"v2")

    def test_falls_back_to_add_file_without_write_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            addon = addon_dir(root, b"v1")
            target = root / "media"
            target.mkdir()
            fake = FakeMedia(target, supports_write_data=False)
            mw = types.SimpleNamespace(col=types.SimpleNamespace(media=fake))

            written = media_module.sync_media(mw, addon)

            self.assertEqual(
                written,
                [
                    runtime_media.hashed_name(
                        "_quizify.js", hashlib.sha256(b"v1").hexdigest()
                    )
                ],
            )
            self.assertTrue((target / written[0]).is_file())


if __name__ == "__main__":
    unittest.main()
