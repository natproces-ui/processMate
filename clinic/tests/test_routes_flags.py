"""Routes de la refonte du chat appelées par HTTP : drapeaux et authentification (sans base)."""
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from manager import auth  # noqa: E402


class FlagsAndAuthTest(unittest.TestCase):
    def setUp(self):
        auth._cache.clear()
        self.client = TestClient(main.app)

    def test_conversations_disabled_by_default(self):
        with mock.patch.dict(os.environ, {"CONVERSATIONS_ENABLED": "false"}):
            self.assertEqual(self.client.get("/api/conversations").status_code, 404)
            self.assertEqual(self.client.get("/api/projects").status_code, 404)

    def test_conversations_require_login(self):
        with mock.patch.dict(os.environ, {"CONVERSATIONS_ENABLED": "true"}):
            self.assertEqual(self.client.get("/api/conversations").status_code, 401)
            self.assertEqual(self.client.post("/api/projects", json={"name": "x"}).status_code, 401)

    def test_invalid_token_rejected(self):
        bad = SimpleNamespace(auth=SimpleNamespace(get_user=mock.Mock(side_effect=RuntimeError("jwt"))))
        with mock.patch.dict(os.environ, {"CONVERSATIONS_ENABLED": "true"}), \
                mock.patch("database.supabase_client.get_supabase", return_value=bad):
            r = self.client.get("/api/conversations", headers={"Authorization": "Bearer faux"})
        self.assertEqual(r.status_code, 401)

    def test_studio_generate_unknown_session_is_404_for_guest(self):
        r = self.client.post("/api/studio/generate", json={"session_id": "inconnue", "procedure_ids": ["p1"]})
        self.assertEqual(r.status_code, 404)

    def test_guest_turn_limit(self):
        from manager import guest_limits as gl
        gl._memory.clear()
        env = {"GUEST_LIMITS_ENABLED": "true", "GUEST_TURNS_PER_DAY": "0"}
        with mock.patch.dict(os.environ, env), \
                mock.patch.object(gl, "_read_db", side_effect=RuntimeError("pas de base")), \
                mock.patch.object(gl, "_write_db", side_effect=RuntimeError("pas de base")):
            r = self.client.post("/api/studio/turn", data={"session_id": "s1", "message": "bonjour"},
                                 headers={"X-Device-Id": "device-test-1234"})
        self.assertEqual(r.status_code, 429)
        self.assertIn("compte", r.json()["detail"])

    def test_guest_file_too_big(self):
        from manager import guest_limits as gl
        gl._memory.clear()
        env = {"GUEST_LIMITS_ENABLED": "true", "GUEST_MAX_FILE_MB": "0"}
        with mock.patch.dict(os.environ, env), \
                mock.patch.object(gl, "_read_db", side_effect=RuntimeError("pas de base")), \
                mock.patch.object(gl, "_write_db", side_effect=RuntimeError("pas de base")):
            r = self.client.post("/api/studio/turn", data={"session_id": "s1", "message": ""},
                                 files={"files": ("a.pdf", b"%PDF-1.4 /Type /Page", "application/pdf")})
        self.assertEqual(r.status_code, 413)


if __name__ == "__main__":
    unittest.main()
