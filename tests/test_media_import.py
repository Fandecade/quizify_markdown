"""Tests for the shared "store a pasted picture in Anki's media folder" helper."""

import base64
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from helpers import load_module


media = load_module("media_import")


def payload(name="图.png", data=b"PNG"):
    return json.dumps(
        {
            "name": name,
            "data": base64.b64encode(data).decode("ascii"),
        }
    )


class MediaImportTest(unittest.TestCase):
    def test_names_are_reduced_to_a_flat_safe_filename(self):
        self.assertEqual(media.media_name("\\Users\\me\\图片.png"), "图片.png")
        self.assertEqual(media.media_name("%E5%9B%BE%E7%89%87.png"), "图片.png")
        self.assertEqual(media.media_name("   "), media.DEFAULT_MEDIA_NAME)
        self.assertEqual(media.media_name(".."), media.DEFAULT_MEDIA_NAME)
        self.assertEqual(media.media_name(None), media.DEFAULT_MEDIA_NAME)

    def test_stored_name_is_returned_so_the_snippet_can_reference_it(self):
        store = mock.Mock(return_value="paste-9f2c.png")
        with mock.patch.object(media, "store_media_file", store):
            reply = json.loads(media.handle_media_message(payload("图 片.png")))
        self.assertEqual(reply, {"name": "paste-9f2c.png"})
        store.assert_called_once_with("图 片.png", b"PNG")

    def test_local_pictures_are_copied_into_the_media_folder(self):
        with tempfile.TemporaryDirectory() as folder:
            good = Path(folder, "网络协议栈.png")
            good.write_bytes(b"PNG")
            store = mock.Mock(side_effect=lambda name, data: name)

            with mock.patch.object(media, "store_media_file", store):
                results = media.store_local_files([str(good)])

        self.assertEqual(results[0]["stored"], "网络协议栈.png")
        self.assertEqual(results[0]["error"], "")
        store.assert_called_once_with("网络协议栈.png", b"PNG")

    def test_media_names_are_reused_when_anki_renames_on_collision(self):
        with tempfile.TemporaryDirectory() as folder:
            good = Path(folder, "图 片.png")
            good.write_bytes(b"PNG")
            store = mock.Mock(return_value="图 片-2.png")

            with mock.patch.object(media, "store_media_file", store):
                results = media.store_local_files([str(good)])

        self.assertEqual(results[0]["stored"], "图 片-2.png")
        store.assert_called_once_with("图 片.png", b"PNG")

    def test_empty_oversized_and_missing_files_are_reported(self):
        with tempfile.TemporaryDirectory() as folder:
            empty = Path(folder, "空.png")
            empty.write_bytes(b"")
            huge = Path(folder, "太大.png")
            huge.write_bytes(b"PNG")
            missing = Path(folder, "不存在.png")

            with mock.patch.object(media, "MAX_MEDIA_BYTES", 1):
                results = media.store_local_files(
                    [str(empty), str(huge), str(missing)]
                )

        self.assertEqual(
            [(entry["source"], entry["stored"], entry["error"]) for entry in results],
            [
                ("空.png", "", "empty"),
                ("太大.png", "", "too_large"),
                ("不存在.png", "", "read_failed"),
            ],
        )

    def test_store_failures_and_a_missing_collection_are_reported(self):
        with tempfile.TemporaryDirectory() as folder:
            boom = Path(folder, "坏存储.png")
            boom.write_bytes(b"PNG")
            good = Path(folder, "好.png")
            good.write_bytes(b"PNG")

            store = mock.Mock(side_effect=[RuntimeError("boom"), ""])
            with mock.patch.object(media, "store_media_file", store):
                results = media.store_local_files([str(boom), str(good)])

        self.assertEqual(
            [(entry["source"], entry["stored"], entry["error"]) for entry in results],
            [
                ("坏存储.png", "", "store_failed"),
                ("好.png", "", "no_collection"),
            ],
        )

    def test_unrelated_messages_are_not_claimed(self):
        handled, result = media.handle_media_bridge_message(False, "quizify:v1")
        self.assertFalse(handled)
        self.assertIsNone(result)
        handled, result = media.handle_media_bridge_message(
            False, media.MEDIA_MESSAGE_PREFIX + payload()
        )
        self.assertTrue(handled)
        self.assertEqual(json.loads(result)["name"], "")

    def test_broken_payloads_fail_closed_instead_of_raising(self):
        for broken in (
            "{not json",
            json.dumps({"name": "a.png", "data": ""}),
            json.dumps({"name": "a.png", "data": "!!!not base64!!!"}),
        ):
            reply = json.loads(media.handle_media_message(broken))
            self.assertEqual(reply["name"], "")
            self.assertTrue(reply.get("error"))

    def test_oversized_pictures_are_rejected_before_they_reach_anki(self):
        with mock.patch.object(media, "MAX_MEDIA_BYTES", 2):
            reply = json.loads(media.handle_media_message(payload(data=b"PNG")))
        self.assertEqual(reply, {"name": "", "error": "too_large"})

    def test_a_missing_collection_is_reported_not_swallowed(self):
        with mock.patch.object(media, "store_media_file", return_value=""):
            reply = json.loads(media.handle_media_message(payload()))
        self.assertEqual(reply, {"name": "", "error": "no_collection"})

    def test_storage_failures_are_reported(self):
        with mock.patch.object(
            media, "store_media_file", side_effect=RuntimeError("disk")
        ):
            reply = json.loads(media.handle_media_message(payload()))
        self.assertEqual(reply, {"name": "", "error": "store_failed"})


if __name__ == "__main__":
    unittest.main()
