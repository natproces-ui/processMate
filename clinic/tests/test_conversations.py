"""Conversations persistées : historique pour le modèle et reconstitution des réponses (sans base)."""
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from manager import conversation_store as store  # noqa: E402
from manager.turn_recorder import TurnRecorder  # noqa: E402


def msg(role, content, payload=None):
    return {"role": role, "content": content, "payload": payload or {}}


class HistoryTest(unittest.TestCase):
    def test_payload_is_remembered(self):
        msgs = [
            msg("user", "Formalise ce document", {"attachments": [{"name": "deck.pptx"}]}),
            msg("assistant", "J'ai trouvé 2 procédures.", {
                "proposal": {"procedures": [{"title": "Organiser"}, {"title": "Payer"}]},
                "generations": [{"title": "Organiser", "steps": 12, "status": "ready"}],
                "remarks": "Étape 4 : acteur à confirmer.", "suggestions": ["Préciser l'acteur"],
            }),
        ]
        h = store.history_for_model(msgs)
        self.assertIn("deck.pptx", h[0]["content"])
        self.assertIn("Organiser ; Payer", h[1]["content"])
        self.assertIn("12 étapes", h[1]["content"])
        self.assertIn("acteur à confirmer", h[1]["content"])

    def test_summary_replaces_old_messages(self):
        msgs = [msg("user", f"m{i}") for i in range(30)]
        h = store.history_for_model(msgs, summary="Résumé", summary_upto=18)
        self.assertTrue(h[0]["content"].startswith("[Résumé"))
        self.assertEqual(len(h), 1 + store.RECENT_MESSAGES)
        self.assertEqual(h[-1]["content"], "m29")

    def test_needs_summary(self):
        self.assertFalse(store.needs_summary([msg("user", "x")] * 20, 0))
        self.assertTrue(store.needs_summary([msg("user", "x")] * 21, 0))
        self.assertFalse(store.needs_summary([msg("user", "x")] * 21, 10))

    def test_title(self):
        self.assertEqual(store.title_from("  Bonjour   le monde ", []), "Bonjour le monde")
        self.assertTrue(store.title_from("x" * 80, []).endswith("…"))
        self.assertEqual(store.title_from("", [{"filename": "a.pdf"}]), "a.pdf")

    def test_is_uuid(self):
        self.assertTrue(store.is_uuid("8c1f6f5e-3f4a-4b7e-9d2a-1b2c3d4e5f60"))
        self.assertFalse(store.is_uuid("abc"))
        self.assertFalse(store.is_uuid(None))

    def test_get_owned_rejects_non_uuid_without_db(self):
        with mock.patch.object(store, "_db", side_effect=AssertionError("pas d'appel base")):
            self.assertIsNone(store.get_owned("pas-un-uuid", "u1"))


class RecorderTest(unittest.TestCase):
    def test_full_turn(self):
        r = TurnRecorder()
        for ev in [
            {"type": "status", "id": "plan", "label": "Lecture", "state": "running"},
            {"type": "status", "id": "plan", "label": "2 procédures trouvées", "state": "done"},
            {"type": "message", "text": "Voici ce que j'ai trouvé."},
            {"type": "procedure_started", "id": "p1", "title": "Organiser"},
            {"type": "procedure_ready", "id": "p1", "title": "Organiser", "workflow": [{"id": "1"}, {"id": "2"}],
             "enrichments": {}, "procedureMetadata": {}},
            {"type": "remarks_delta", "text": "Bon "}, {"type": "remarks_delta", "text": "travail."},
            {"type": "suggestions", "items": ["A"]},
            {"type": "done"},
        ]:
            r.feed(ev)
        out = r.finish()
        self.assertEqual(out["role"], "assistant")
        self.assertEqual(out["content"], "Voici ce que j'ai trouvé.")
        p = out["payload"]
        self.assertEqual(p["steps"][0]["label"], "2 procédures trouvées")
        self.assertEqual(p["generations"][0]["status"], "ready")
        self.assertEqual(p["generations"][0]["steps"], 2)
        self.assertEqual(p["remarks"], "Bon travail.")
        self.assertEqual(p["generated"][0]["workflow"][1]["id"], "2")

    def test_stopped(self):
        r = TurnRecorder()
        r.feed({"type": "status", "id": "plan", "label": "Lecture", "state": "running"})
        r.feed({"type": "procedure_started", "id": "p1", "title": "X"})
        out = r.finish(stopped=True)
        self.assertEqual(out["payload"]["steps"][0]["state"], "stopped")
        self.assertEqual(out["payload"]["generations"][0]["status"], "stopped")

    def test_chat_results(self):
        r = TurnRecorder()
        r.feed({"type": "chat_result", "result": {"intent": "clarify", "clarify_question": "Quel acteur ?"}})
        self.assertEqual(r.finish(), {"role": "clarify", "content": "Quel acteur ?", "payload": {"intent": "clarify"}})
        r = TurnRecorder()
        r.feed({"type": "chat_result", "result": {"intent": "patch", "explanation": "2 étapes ajoutées", "operations_count": 2}})
        out = r.finish()
        self.assertEqual(out["content"], "2 étapes ajoutées")
        self.assertEqual(out["payload"]["operationsCount"], 2)
        r = TurnRecorder()
        r.feed({"type": "chat_result", "result": {"intent": "generate", "title": "T", "workflow": [{"id": "1"}]}})
        out = r.finish()
        self.assertIn("« T »", out["content"])
        self.assertEqual(out["payload"]["generated"][0]["title"], "T")

    def test_error_only(self):
        r = TurnRecorder()
        r.feed({"type": "error", "message": "Limite atteinte"})
        r.feed({"type": "done"})
        self.assertEqual(r.finish()["content"], "Limite atteinte")


if __name__ == "__main__":
    unittest.main()
