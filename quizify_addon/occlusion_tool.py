"""Desktop entry point for the image-occlusion coordinate builder.

The heavy lifting lives in a self-contained HTML page
(``web/occlusion-tool.html``) that is generated from ``src/shared/occlusion.js``
by ``tools/build.mjs``. Presenting it in a plain WebView keeps a single source of
truth for the occlusion syntax across the reviewer, the ``.apkg`` sample deck and
this authoring tool.

The page only needs two things from Python:

* a place to render (an ``AnkiWebView``), and
* a clipboard fallback for engines where ``document.execCommand("copy")`` is
  unavailable -- the page reports the finished block back through ``pycmd``.

Copying into the clipboard instead of poking at the editor keeps this dialog
independent of whichever Anki editor (legacy or CodeMirror 6) is in front.
"""

from __future__ import annotations

import json
from pathlib import Path

from .i18n import tr

# Read the version straight from the manifest instead of importing the addon
# entry point, which would pull in aqt and keep this module untestable outside
# Anki.
ADDON_DIR = Path(__file__).parent
ADDON_MODULE = __name__.split(".")[0]


def _manifest_version() -> str:
    try:
        manifest = json.loads((ADDON_DIR / "manifest.json").read_text(encoding="utf-8"))
        return str(manifest.get("version", "unknown"))
    except (OSError, ValueError):
        return "unknown"


ADDON_VERSION = _manifest_version()

# Matches the shim injected into the tool page inside Anki.
COPY_MESSAGE_PREFIX = "quizify:occlusion-copy:"
COPY_RESULT_OK = "quizify:occlusion-copied"


def build_tool_url(addon_module: str) -> str:
    """Relative AnkiWebView URL for the generated builder page."""
    return f"/_addons/{addon_module}/web/occlusion-tool.html?v={ADDON_VERSION}"


def _clipboard_shim() -> str:
    """Give the page a working clipboard when the WebView lacks the async API.

    The tool already tries ``navigator.clipboard`` first, then
    ``document.execCommand``; this shim is the last resort and also lets the
    dialog confirm the copy happened.
    """
    return (
        "(function(){"
        "  var bridge = globalThis.pycmd;"
        "  if (!bridge) return;"
        "  function send(text){"
        "    try { bridge(" + repr(COPY_MESSAGE_PREFIX) + " + "
        "encodeURIComponent(text)); } catch (error) { /* ignore */ }"
        "  }"
        "  var clipboard = globalThis.navigator ? globalThis.navigator.clipboard : null;"
        "  if (!clipboard || typeof clipboard.writeText !== 'function') {"
        "    try {"
        "      Object.defineProperty(globalThis.navigator, 'clipboard', {"
        "        configurable: true,"
        "        value: { writeText: function(text){ send(text); "
        "return Promise.resolve(); } }"
        "      });"
        "    } catch (error) { /* navigator is locked down: rely on execCommand */ }"
        "  }"
        "})();"
    )


def _show_copy_result(success: bool) -> None:
    try:
        from aqt.utils import tooltip

        tooltip(
            tr("occlusion.tool.copied") if success else tr("occlusion.tool.copy_failed")
        )
    except Exception:
        pass


def copy_to_clipboard(text: str) -> bool:
    """Put ``text`` on the system clipboard. Returns whether it succeeded."""
    try:
        from aqt.qt import QApplication

        clipboard = QApplication.clipboard()
        if clipboard is None:
            return False
        clipboard.setText(text)
        return True
    except Exception:
        return False


def handle_tool_message(handled, message: str):
    """Handle the tool page's clipboard fallback. Returns ``(handled, result)``."""
    if not message.startswith(COPY_MESSAGE_PREFIX):
        return handled, None
    from urllib.parse import unquote

    text = unquote(message[len(COPY_MESSAGE_PREFIX):])
    copied = copy_to_clipboard(text)
    _show_copy_result(copied)
    return True, COPY_RESULT_OK if copied else ""


def show_occlusion_tool() -> None:
    """Open the coordinate builder in a standalone Anki dialog."""
    from aqt import mw
    from aqt.qt import QDialog, QLabel, QPushButton, QVBoxLayout
    from aqt.webview import AnkiWebView

    if getattr(mw, "_quizify_occlusion_dialog", None):
        mw._quizify_occlusion_dialog.raise_()
        mw._quizify_occlusion_dialog.activateWindow()
        return

    dialog = QDialog(mw)
    dialog.setWindowTitle(tr("occlusion.tool.window_title"))
    dialog.resize(1180, 860)

    layout = QVBoxLayout(dialog)
    layout.setContentsMargins(14, 12, 14, 12)
    layout.setSpacing(8)

    hint = QLabel(tr("occlusion.tool.hint"))
    hint.setWordWrap(True)
    layout.addWidget(hint)

    web = AnkiWebView(parent=dialog)
    web.set_bridge_command(
        lambda message: handle_tool_message(False, message)[1] or "", dialog
    )
    url = build_tool_url(ADDON_MODULE)
    loader = getattr(web, "setUrl", None) or getattr(web, "load")  # Qt5 vs Qt6
    loader(url)
    web.eval(_clipboard_shim())
    layout.addWidget(web, 1)

    buttons = QPushButton(tr("occlusion.tool.close"))
    buttons.clicked.connect(dialog.accept)
    layout.addWidget(buttons, 0)

    mw._quizify_occlusion_dialog = dialog
    dialog.finished.connect(lambda _result: setattr(mw, "_quizify_occlusion_dialog", None))
    dialog.show()
