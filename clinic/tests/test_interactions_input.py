"""Voie API Interactions (manager/model_manager.py) : conversion des contenus et repli."""
import base64
import io
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image  # noqa: E402

from manager import model_manager as mm  # noqa: E402


class ConversionTest(unittest.TestCase):
    def decode(self, item):
        return Image.open(io.BytesIO(base64.b64decode(item["data"])))

    def test_cmyk_image_from_slides(self):
        out = mm._to_interaction_input(["Lis ceci", Image.new("CMYK", (4, 4))])
        self.assertEqual(out[0], {"type": "text", "text": "Lis ceci"})
        self.assertEqual(self.decode(out[1]).mode, "RGB")

    def test_palette_with_transparency_keeps_alpha(self):
        img = Image.new("P", (4, 4))
        img.info["transparency"] = 0
        self.assertEqual(self.decode(mm._to_interaction_input([img])[0]).mode, "RGBA")

    def test_pdf_bytes_and_unknown(self):
        out = mm._to_interaction_input([{"inline_data": {"data": b"%PDF", "mime_type": "application/pdf"}}])
        self.assertEqual(out[0]["type"], "document")
        self.assertIsNone(mm._to_interaction_input([object()]))


class FallbackTest(unittest.TestCase):
    def test_conversion_error_falls_back(self):
        fake_client = SimpleNamespace(interactions=SimpleNamespace(create=mock.Mock()))
        with mock.patch.object(mm, "STUDIO_USE_INTERACTIONS", True), \
                mock.patch.object(mm, "_client", return_value=fake_client), \
                mock.patch.object(mm, "_to_interaction_input", side_effect=OSError("boom")), \
                mm.interactions_scope({"store": False, "ids": []}):
            self.assertIsNone(mm._try_interaction(mm.GeminiModel.LITE, ["x"], None, "test"))
        fake_client.interactions.create.assert_not_called()

    def test_disabled_outside_scope(self):
        with mock.patch.object(mm, "STUDIO_USE_INTERACTIONS", True):
            self.assertIsNone(mm._try_interaction(mm.GeminiModel.LITE, ["x"], None, "test"))


if __name__ == "__main__":
    unittest.main()
