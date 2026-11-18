"""Limites du mode invité (manager/guest_limits.py). Sans Supabase : compteur mémoire."""
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from manager import guest_limits as gl  # noqa: E402


def limits(**kw):
    base = dict(enabled=True, max_files=1, max_file_mb=5, max_pages=15, turns_per_day=3, generations_per_day=1)
    base.update(kw)
    return gl.GuestLimits(**base)


class GuestLimitsTest(unittest.TestCase):
    def setUp(self):
        gl._memory.clear()
        # Pas de base : forcer le repli mémoire
        self.p1 = mock.patch.object(gl, "_read_db", side_effect=RuntimeError("pas de base"))
        self.p2 = mock.patch.object(gl, "_write_db", side_effect=RuntimeError("pas de base"))
        self.p1.start(); self.p2.start()

    def tearDown(self):
        self.p1.stop(); self.p2.stop()

    def test_disabled_by_default(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("GUEST_LIMITS_ENABLED", None)
            self.assertFalse(gl.load_limits().enabled)
            gl.consume(("dev:abcdefgh",), "turns")  # aucune exception, rien compté
        self.assertEqual(gl._memory, {})

    def test_turns_limit(self):
        keys = gl.guest_keys("device-1234", "1.2.3.4")
        for _ in range(3):
            gl.consume(keys, "turns", limits())
        with self.assertRaises(gl.GuestLimitError) as ctx:
            gl.consume(keys, "turns", limits())
        self.assertEqual(ctx.exception.status, 429)
        self.assertIn("compte", str(ctx.exception))

    def test_same_ip_new_device_still_limited(self):
        for _ in range(3):
            gl.consume(gl.guest_keys("device-aaaa", "9.9.9.9"), "turns", limits())
        with self.assertRaises(gl.GuestLimitError):
            gl.consume(gl.guest_keys("device-bbbb", "9.9.9.9"), "turns", limits())

    def test_generations_counted_separately(self):
        keys = gl.guest_keys("device-1234", "1.2.3.4")
        gl.consume(keys, "generations", limits())
        gl.consume(keys, "turns", limits())
        with self.assertRaises(gl.GuestLimitError):
            gl.consume(keys, "generations", limits())

    def test_invalid_device_id_ignored(self):
        keys = gl.guest_keys("<script>", "1.2.3.4")
        self.assertEqual(len(keys), 1)
        self.assertTrue(keys[0].startswith("ip:"))
        self.assertNotIn("1.2.3.4", keys[0])

    def test_client_ip_behind_proxy(self):
        self.assertEqual(gl.client_ip({"x-forwarded-for": "5.6.7.8, 10.0.0.1"}, "10.0.0.1"), "5.6.7.8")
        self.assertEqual(gl.client_ip({}, "10.0.0.2"), "10.0.0.2")

    def test_files(self):
        small = {"filename": "a.pdf", "type": "pdf", "size": 1000, "data": b"/Type /Pages /Type /Page /Type /Page"}
        gl.check_files([small], limits())
        with self.assertRaises(gl.GuestLimitError) as ctx:
            gl.check_files([small, small], limits())
        self.assertEqual(ctx.exception.status, 413)
        with self.assertRaises(gl.GuestLimitError):
            gl.check_files([{**small, "size": 6 * 1024 * 1024}], limits())
        with self.assertRaises(gl.GuestLimitError):
            gl.check_files([{**small, "data": b"/Type /Page " * 16}], limits())

    def test_pdf_pages_ignore_pages_node(self):
        self.assertEqual(gl.count_pdf_pages(b"/Type /Pages /Type /Page /Type/Page"), 2)

    def test_pptx_pages(self):
        text = "## Diapositive 1 : Titre\nx\n## Diapositive 2\ny"
        self.assertEqual(len(__import__("re").findall(r"^## Diapositive \d+", text, flags=__import__("re").M)), 2)
        gl.check_files([{"filename": "d.pptx", "type": "pptx", "size": 10, "office": {"text": text}}], limits())
        with self.assertRaises(gl.GuestLimitError):
            gl.check_files([{"filename": "d.pptx", "type": "pptx", "size": 10, "office": {"text": text}}], limits(max_pages=1))


if __name__ == "__main__":
    unittest.main()
