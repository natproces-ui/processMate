"""Images CMJN, à palette ou transparentes : envoyables au modèle (le tour échouait sur un PowerPoint)."""
import io
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image  # noqa: E402
from google.genai import _transformers  # noqa: E402

from processor.office_extract import office_parts, to_sendable  # noqa: E402


def blob(mode: str, fmt: str) -> bytes:
    buf = io.BytesIO()
    Image.new(mode, (40, 30), 0).save(buf, format=fmt)
    return buf.getvalue()


class ImageModesTest(unittest.TestCase):
    def test_cmyk_jpeg_in_powerpoint_reaches_the_model(self):
        parts = office_parts({"filename": "deck.pptx", "type": "pptx",
                              "office": {"text": "Slide 1", "images": [blob("CMYK", "JPEG")]}})
        # conversion faite par le client Gemini avant l'envoi : c'est elle qui levait
        # « cannot write mode CMYK as PNG »
        _transformers.t_contents(parts)
        self.assertEqual(parts[-1].mode, "RGB")

    def test_modes(self):
        self.assertEqual(to_sendable(Image.new("CMYK", (4, 4))).mode, "RGB")
        self.assertEqual(to_sendable(Image.new("I;16", (4, 4))).mode, "RGB")
        self.assertEqual(to_sendable(Image.new("RGBA", (4, 4))).mode, "RGBA")
        p = Image.new("P", (4, 4))
        p.info["transparency"] = 0
        self.assertEqual(to_sendable(p).mode, "RGBA")


if __name__ == "__main__":
    unittest.main()
