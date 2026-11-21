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

    def test_agent_turn_end_to_end(self):
        from google.genai import types
        content = types.Content(role="model", parts=[types.Part.from_text(text="x")])
        fake = SimpleNamespace(function_calls=None, text="Bonjour, que souhaitez-vous formaliser ?",
                               candidates=[SimpleNamespace(content=content)])
        with mock.patch.dict(os.environ, {"STUDIO_AGENT_ENABLED": "true"}), \
                mock.patch("manager.model_manager.generate_content", return_value=fake):
            r = self.client.post("/api/studio/turn", data={"session_id": "agent-test", "message": "bonjour"})
        self.assertEqual(r.status_code, 200)
        self.assertIn("que souhaitez-vous formaliser", r.text)
        self.assertIn('"type": "done"', r.text)

    def test_sources_already_joined_are_analysed_on_retry(self):
        """Relance après une erreur : le fichier est déjà dans les sources, il doit être lu
        (avant : le chat rédigeait une procédure sans l'avoir lu)."""
        from routers import studio_router
        from processor.studio_planner import StudioPlan
        seen = []

        def fake_plan(message, files, has_workflow, history, proposal, referential_pending=False):
            seen.append([f["filename"] for f in files])
            if len(seen) == 1:
                raise RuntimeError("cannot write mode CMYK as PNG")
            return StudioPlan(action="propose", reply="3 procédures trouvées.",
                              procedures=[{"id": f"p{i}", "title": f"Procédure {i}"} for i in range(1, 4)])

        env = {"GUEST_LIMITS_ENABLED": "false", "STUDIO_AGENT_ENABLED": "false"}
        with mock.patch.dict(os.environ, env), mock.patch.object(studio_router, "plan_turn", fake_plan),                 mock.patch.object(studio_router, "_delegate_to_chat", side_effect=AssertionError("chat sans les sources")):
            r1 = self.client.post("/api/studio/turn", data={"session_id": "retry-sources", "message": "extrais"},
                                  files={"files": ("deck.pdf", b"%PDF-1.4 /Type /Page", "application/pdf")})
            r2 = self.client.post("/api/studio/turn", data={"session_id": "retry-sources", "message": "extrais"})
        self.assertIn('"type": "error"', r1.text)
        self.assertEqual(seen, [["deck.pdf"], ["deck.pdf"]])
        self.assertIn('"type": "proposal"', r2.text)


if __name__ == "__main__":
    unittest.main()
