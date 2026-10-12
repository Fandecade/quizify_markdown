from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .core import files_identical
from .i18n import tr
from .runtime_media import MANIFEST_NAME, load_media_names, write_media_file


def load_media_manifest(addon_dir: Path) -> dict:
    path = addon_dir / MANIFEST_NAME
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema_version") != 1 or not isinstance(data.get("files"), dict):
        raise ValueError(tr("media.manifest_unsupported"))
    return data


def verify_media_file(path: Path, expected: dict) -> None:
    data = path.read_bytes()
    if len(data) != expected.get("bytes"):
        raise ValueError(tr("media.size_mismatch", file=path.name))
    digest = hashlib.sha256(data).hexdigest()
    if digest != expected.get("sha256"):
        raise ValueError(tr("media.checksum_mismatch", file=path.name))


def media_status(addon_dir: Path) -> tuple[int, int, list[str]]:
    manifest = load_media_manifest(addon_dir)
    missing = []
    ready = 0
    for name, expected in manifest["files"].items():
        path = addon_dir / name
        try:
            verify_media_file(path, expected)
            ready += 1
        except (OSError, ValueError):
            missing.append(name)
    return ready, len(manifest["files"]), missing


def sync_media(mw, addon_dir: Path) -> list[str]:
    """Copy the runtime into ``collection.media`` under its content name.

    Anki will not replace an existing media file, so each release lands under
    a name derived from its own checksum instead of overwriting the previous
    one.  Returns the file names written into the media folder.
    """

    manifest = load_media_manifest(addon_dir)
    names = load_media_names(addon_dir)
    media = mw.col.media
    media_dir = Path(media.dir())

    changed: list[tuple[Path, str]] = []
    for name, expected in manifest["files"].items():
        source = addon_dir / name
        verify_media_file(source, expected)
        if not files_identical(source, media_dir / names[name]):
            changed.append((source, names[name]))
    if not changed:
        return []

    existing = [name for _, name in changed if (media_dir / name).is_file()]
    if existing:
        media.trash_files(existing)

    written = []
    for source, name in changed:
        written.append(write_media_file(media, source, name))
    return written
