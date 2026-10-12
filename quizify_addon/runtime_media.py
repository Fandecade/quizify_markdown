"""Content-addressed file names for the card runtime.

Anki never overwrites an existing media file: importing a ``.apkg`` skips any
name that is already present, and AnkiWeb media sync behaves the same way.  A
runtime stored under a fixed name therefore cannot be upgraded on a phone or
tablet - the client keeps loading whatever copy landed there first.

Naming each runtime asset after its own content hash fixes that: every build
ships file names the client has never seen, so importing or syncing writes
them, while unchanged assets keep their names and are skipped exactly as
before.  ``collection.media`` accumulates the superseded names, which Anki's
"Check Media" reports as unused.
"""

from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path


MANIFEST_NAME = "media-manifest.json"

#: Runtime assets referenced by the card templates.  Everything else in the
#: manifest (the KaTeX fonts) is already content addressed by the bundler.
RUNTIME_FILES = (
    "_persistence.js",
    "_quizify-i18n.js",
    "_quizify.css",
    "_quizify.js",
)

HASH_LENGTH = 10


def hashed_name(name: str, sha256: str) -> str:
    """``_quizify.js`` + ``bfe61a75...`` -> ``_quizify.bfe61a7589.js``."""

    stem, dot, suffix = name.rpartition(".")
    if not dot or not stem:
        raise ValueError(f"cannot address media file {name!r} by content")
    return f"{stem}.{sha256[:HASH_LENGTH]}{dot}{suffix}"


def media_names(files: dict) -> dict:
    """Map bundled file names to the names used inside ``collection.media``."""

    names = {}
    for name, meta in files.items():
        digest = str(meta.get("sha256", ""))
        names[name] = (
            hashed_name(name, digest) if name in RUNTIME_FILES and digest else name
        )
    return names


def load_media_names(addon_dir: Path) -> dict:
    manifest = json.loads((addon_dir / MANIFEST_NAME).read_text(encoding="utf-8"))
    if manifest.get("schema_version") != 1 or not isinstance(
        manifest.get("files"), dict
    ):
        raise ValueError("unsupported media manifest schema")
    return media_names(manifest["files"])


def rewrite_references(text: str, names: dict) -> str:
    """Point ``./_quizify.js`` style references at the content-addressed files."""

    for name in RUNTIME_FILES:
        target = names.get(name)
        if target and target != name:
            text = text.replace(f"./{name}", f"./{target}")
    return text


def write_media_file(media, source: Path, name: str) -> str:
    """Store ``source`` in Anki's media folder under the exact ``name``.

    ``MediaManager.add_file()`` derives the file name from the source path, so
    it cannot be used for the content-addressed names; ``write_data()`` can,
    and older releases fall back to staging a correctly named copy.
    """

    data = source.read_bytes()
    write_data = getattr(media, "write_data", None)
    if callable(write_data):
        return str(write_data(name, data) or name)
    staging = Path(tempfile.mkdtemp(prefix="quizify-media-"))
    try:
        staged = staging / name
        staged.write_bytes(data)
        return str(media.add_file(str(staged)) or name)
    finally:
        shutil.rmtree(staging, ignore_errors=True)
