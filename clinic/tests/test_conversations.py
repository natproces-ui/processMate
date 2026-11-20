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

    def test_open_points_follow_generated_procedure(self):
        r = TurnRecorder()
        r.feed({"type": "procedure_ready", "id": "p1", "title": "X", "workflow": [{"id": "1"}],
                "enrichments": {}, "procedureMetadata": {"objet": "o"}})
        r.feed({"type": "open_points", "id": "p1", "points": [{"id": "a", "question": "Qui valide ?"}]})
        meta = r.finish()["payload"]["generated"][0]["procedureMetadata"]
        self.assertEqual(meta["objet"], "o")
        self.assertEqual(meta["open_points"][0]["question"], "Qui valide ?")

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


class ProceduresStateTest(unittest.TestCase):
    """Procédures gardées dans l'état de la conversation, sans écraser le reste."""

    def setUp(self):
        self.conv = {"id": "c1", "owner_id": "u1", "state": {"proposal": {"procedures": []}, "references": ["r"]}}
        self.written = []

        def fake_update(cid, owner, **fields):
            self.conv = {**self.conv, **fields}
            return self.conv

        class Q:
            def __init__(q, data=None): q.data = data
            def update(q, data): self.written.append(data); self.conv = {**self.conv, **data}; return q
            def eq(q, *_): return q
            def execute(q): return q
            def table(q, _): return q

        self.patches = [
            mock.patch.object(store, "get_owned", side_effect=lambda cid, owner: self.conv if owner == "u1" else None),
            mock.patch.object(store, "update", side_effect=fake_update),
            mock.patch.object(store, "_db", return_value=Q()),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def test_save_keeps_proposal_and_drops_unknown_keys(self):
        ok = store.save_procedures("c1", "u1", [
            {"key": "a", "title": "Épargne", "workflow": [{"id": "1"}], "secret": "x"},
            {"title": "sans clé"},
        ], "a")
        self.assertTrue(ok)
        state = self.conv["state"]
        self.assertEqual(state["references"], ["r"])
        self.assertEqual(state["active_procedure"], "a")
        self.assertEqual(state["procedures"], [{"key": "a", "title": "Épargne", "workflow": [{"id": "1"}]}])
        # sauvegarde silencieuse : la conversation ne remonte pas dans les récents
        self.assertNotIn("updated_at", self.written[-1])

    def test_turn_merge_keeps_procedures(self):
        store.save_procedures("c1", "u1", [{"key": "a", "title": "T"}], "a")
        store.merge_state("c1", "u1", proposal=None, references=[])
        self.assertEqual(self.conv["state"]["procedures"], [{"key": "a", "title": "T"}])
        self.assertEqual(store.procedures_of(self.conv)["active_procedure"], "a")

    def test_other_owner_refused(self):
        self.assertFalse(store.save_procedures("c1", "u2", [{"key": "a"}], None))
