"""Tests for the desktop image-occlusion coordinate builder entry point."""

from urllib.parse import quote

import unittest

from helpers import load_module


tool = load_module("occlusion_tool")


class OcclusionToolTest(unittest.TestCase):
    def test_tool_url_points_at_the_generated_addon_page(self):
        url = tool.build_tool_url("anki_quizify")
        self.assertEqual(
            url,
            "/_addons/anki_quizify/web/occlusion-tool.html?v="
            + tool.ADDON_VERSION,
        )

    def test_clipboard_messages_are_claimed_before_the_reviewer_bridge(self):
        text = ':::: occlusion url="a.png"\n1. 10,10,30,20 标签\n::::'
        message = tool.COPY_MESSAGE_PREFIX + quote(text)
        handled, result = tool.handle_tool_message(False, message)
        # The handler claims the message; the clipboard itself is exercised by
        # the Qt-backed integration, so only the routing contract is asserted.
        self.assertTrue(handled)
        self.assertIn(result, {"", tool.COPY_RESULT_OK})

    def test_unrelated_messages_fall_through_to_the_reviewer(self):
        handled, result = tool.handle_tool_message(False, '{"type":"quizify:v1"}')
        self.assertFalse(handled)
        self.assertIsNone(result)

    def test_clipboard_shim_bridges_pycmd(self):
        shim = tool._clipboard_shim()
        self.assertIn("globalThis.pycmd", shim)
        self.assertIn(tool.COPY_MESSAGE_PREFIX, shim)
        self.assertIn("writeText", shim)


if __name__ == "__main__":
    unittest.main()
