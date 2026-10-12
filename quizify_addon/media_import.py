"""Store pictures pasted into Quizify inside Anki's media folder.

Anki only syncs files that live in ``collection.media``. A card that points at
a file on the author's disk (``url="/Users/me/图片.png"``) therefore renders on
that one machine and nowhere else, which is why a phone shows a broken picture
or the raw path. The note editor hands pasted picture bytes to this module over
the WebView bridge, and Anki then assigns the synced filename.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
from urllib.parse import unquote

# One prefix for every surface that can receive a pasted picture.
MEDIA_MESSAGE_PREFIX = "quizify:media:add:"
MAX_MEDIA_BYTES = 64 * 1024 * 1024
DEFAULT_MEDIA_NAME = "quizify-image.png"


def media_name(raw) -> str:
    """Reduce whatever the WebView sent to a flat, safe media filename."""
    text = unquote(str(raw or "")).replace("\\", "/")
    name = text.split("/")[-1].strip()
    name = "".join(char for char in name if char.isprintable()).strip()
    if not name or name in {".", ".."}:
        return DEFAULT_MEDIA_NAME
    return name


def media_reply(name: str, error: str = "") -> str:
    payload = {"name": name}
    if error:
        payload["error"] = error
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def store_media_file(name: str, data: bytes) -> str:
    """Write ``data`` into the collection media folder, returning its name."""
    from aqt import mw

    col = getattr(mw, "col", None)
    if col is None:
        return ""
    return col.media.write_data(name, data)


def handle_media_message(payload: str) -> str:
    """Store one pasted picture. Always returns a JSON reply, never raises."""
    try:
        request = json.loads(payload)
        name = media_name(request.get("name"))
        encoded = str(request.get("data") or "")
        data = base64.b64decode(encoded, validate=False)
    except Exception:
        return media_reply("", "invalid_request")
    if not data:
        return media_reply("", "empty")
    if len(data) > MAX_MEDIA_BYTES:
        return media_reply("", "too_large")
    try:
        stored = store_media_file(name, data)
    except Exception:
        return media_reply("", "store_failed")
    return media_reply(stored) if stored else media_reply("", "no_collection")


def store_local_files(paths) -> list[dict]:
    """Copy pictures from disk into the media folder. Never raises.

    Each result carries the ``source`` name, the ``stored`` media filename Anki
    actually used, and an ``error`` code when the file could not be imported.
    Authors reach this through the tools menu, so a page opened outside Anki can
    still put its picture where every device will see it.
    """

    results = []
    for path in paths:
        source = Path(path)
        entry = {"source": source.name, "stored": "", "error": ""}
        try:
            data = source.read_bytes()
        except OSError:
            entry["error"] = "read_failed"
        else:
            if not data:
                entry["error"] = "empty"
            elif len(data) > MAX_MEDIA_BYTES:
                entry["error"] = "too_large"
            else:
                try:
                    entry["stored"] = store_media_file(media_name(source.name), data)
                except Exception:
                    entry["error"] = "store_failed"
                if not entry["stored"] and not entry["error"]:
                    entry["error"] = "no_collection"
        results.append(entry)
    return results


def import_media_files(parent=None) -> list[dict]:
    """Ask for pictures and copy them into the media folder.

    Returns the same per-file results as :func:`store_local_files`; the names are
    also put on the clipboard because the author needs them for ``url=``.
    """

    from aqt import mw
    from aqt.qt import QFileDialog

    from .i18n import tr

    paths, _selected = QFileDialog.getOpenFileNames(
        parent or mw,
        tr("media.import.window_title"),
        "",
        tr("media.import.filter"),
    )
    if not paths:
        return []

    results = store_local_files(paths)
    stored = [entry["stored"] for entry in results if entry["stored"]]
    skipped = [entry["source"] for entry in results if not entry["stored"]]
    report_import(stored, skipped)
    return results


def report_import(stored, skipped) -> None:
    """Tell the author which media names to use, and copy them to the clipboard."""

    from .i18n import tr

    try:
        from aqt.utils import showInfo, showWarning
    except Exception:
        return

    if stored:
        copy_to_clipboard("\n".join(stored))
        message = tr("media.import.done", names="\n".join(stored))
        if skipped:
            message = f"{message}\n\n" + tr("media.import.skipped", names=", ".join(skipped))
        showInfo(message)
    else:
        showWarning(tr("media.import.failed", names=", ".join(skipped)))


def copy_to_clipboard(text: str) -> bool:
    """Put ``text`` on the system clipboard, if a Qt application exists."""

    try:
        from aqt.qt import QApplication

        clipboard = QApplication.clipboard()
        if clipboard is None:
            return False
        clipboard.setText(text)
        return True
    except Exception:
        return False


def handle_media_bridge_message(handled, message: str):
    """Claim ``quizify:media:add:`` messages. Returns ``(handled, result)``."""
    if not message.startswith(MEDIA_MESSAGE_PREFIX):
        return handled, None
    return True, handle_media_message(message[len(MEDIA_MESSAGE_PREFIX):])
