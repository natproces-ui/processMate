"""Procédures de la conversation côté serveur, avec leurs versions (docs/conversation-serveur.md) — base simulée."""
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from manager import conversation_procedures as cp  # noqa: E402
from manager import turn_procedures  # noqa: E402
from manager.turn_recorder import TurnRecorder  # noqa: E402
from manager.workflow_operations import apply_operations, apply_with_descriptions, summarize_changes  # noqa: E402
from tests.fake_db import FakeDB  # noqa: E402


def step(i, label, actor="BOI", nxt=None, typ="Task"):
    return {"id": str(i), "étape": label, "typeBpmn": typ, "département": actor, "acteur": actor, "typeActeur": "interne",
            "condition": "", "outil": "", "outputs": [{"targetId": str(n), "label": ""} for n in (nxt or [])]}


WF = [step(1, "Recevoir", nxt=[2], typ="StartEvent"), step(2, "Vérifier", nxt=[3]), step(3, "Valider", nxt=[4]),
      step(4, "Fin", typ="EndEvent")]


class OperationsTest(unittest.TestCase):
    def test_same_as_screen(self):
        ops = [{"type": "add", "after_id": "2", "row": {"id": "NEW_1", "étape": "Contrôler", "acteur": "Conformité",
                                                       "outputs": [{"targetId": "3", "label": ""}], "description": "Contrôle LAB"}},
               {"type": "relink", "id": "2", "outputs": [{"targetId": "NEW_1", "label": ""}]},
               {"type": "update", "id": "3", "fields": {"acteur": "Superviseur", "description": "Valide la saisie"}},
               {"type": "move", "id": "4", "acteur": "Superviseur"}]
        rows, enr = apply_with_descriptions(WF, {}, ops)
        self.assertEqual([r["id"] for r in rows], ["1", "2", "5", "3", "4"])
        self.assertEqual(rows[1]["outputs"], [{"targetId": "5", "label": ""}])
        self.assertEqual(rows[3]["acteur"], "Superviseur")
        self.assertNotIn("description", rows[2])
        self.assertEqual(enr["5"]["descriptif"], "Contrôle LAB")
        self.assertEqual(enr["3"]["descriptif"], "Valide la saisie")
        self.assertIn("1 étape ajoutée", summarize_changes(WF, rows))

    def test_delete_reconnects(self):
        rows = apply_operations(WF, [{"type": "delete", "id": "3", "reconnect": True}])
        self.assertEqual([r["id"] for r in rows], ["1", "2", "4"])
        self.assertEqual(rows[1]["outputs"], [{"targetId": "4", "label": ""}])


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.db = FakeDB({"conversations": [{"id": "c1", "owner_id": "u1", "state": {}}]},
                         unique={"conversation_procedure_versions": [("procedure_id", "version")],
                                 "conversation_procedures": [("conversation_id", "key")]})
        self.p = mock.patch.object(cp, "_db", return_value=self.db)
        self.p.start()
        cp._available.clear()

    def tearDown(self):
        self.p.stop()
        cp._available.clear()

    def content(self, title="Credoc", wf=None):
        return {"title": title, "workflow": wf or WF, "enrichments": {}, "procedureMetadata": {"nom": title}}

    def test_create_and_versions(self):
        created = cp.create("c1", "m1:p1", self.content(), "generation", "msg-1", "4 étapes", "u1")
        self.assertEqual((created["version"], created["title"], len(created["workflow"])), (1, "Credoc", 4))
        proc = cp.get("c1", "m1:p1")
        nxt = cp.add_version(proc, self.content(wf=WF[:3]), "modification", "msg-2", "1 étape retirée", "u1")
        self.assertEqual(nxt["version"], 2)
        self.assertEqual(len(cp.list_procedures("c1")[0]["workflow"]), 3)
        hist = cp.versions("c1", "m1:p1")
        self.assertEqual([(v["version"], v["origine"], v["courante"]) for v in hist],
                         [(2, "modification", True), (1, "generation", False)])

    def test_same_content_again_is_not_a_new_version(self):
        cp.create("c1", "m1:p1", self.content())
        self.assertEqual(cp.create("c1", "m1:p1", self.content(), "generation", "msg-1")["version"], 1)
        self.assertEqual(cp.create("c1", "m1:p1", self.content(wf=WF[:2]), "generation")["version"], 2)

    def test_conflict_when_procedure_moved_on(self):
        cp.create("c1", "k", self.content())
        cp.add_version(cp.get("c1", "k"), self.content(wf=WF[:3]), "modification")
        with self.assertRaises(cp.Conflict) as e:
            cp.add_version(cp.get("c1", "k"), self.content(wf=WF[:2]), "manuel", base_version=1, author_id="u1")
        self.assertEqual(e.exception.current["version"], 2)
        self.assertEqual(cp.get("c1", "k")["current_version"], 2)  # rien n'est écrit

    def test_manual_edits_in_the_same_minute_form_one_version(self):
        cp.create("c1", "k", self.content())
        cp.add_version(cp.get("c1", "k"), self.content(wf=WF[:3]), "manuel", author_id="u1", base_version=1)
        again = cp.add_version(cp.get("c1", "k"), self.content(wf=WF[:2]), "manuel", author_id="u1", base_version=2)
        self.assertEqual(again["version"], 2)
        self.assertEqual(len(again["workflow"]), 2)
        # une modification du chat ensuite : une nouvelle version
        self.assertEqual(cp.add_version(cp.get("c1", "k"), self.content(), "modification")["version"], 3)

    def test_restore_creates_a_new_version(self):
        cp.create("c1", "k", self.content())
        cp.add_version(cp.get("c1", "k"), self.content(wf=WF[:2]), "modification")
        back = cp.restore_version("c1", "k", 1, "u1")
        self.assertEqual((back["version"], len(back["workflow"])), (3, 4))
        self.assertEqual(cp.versions("c1", "k")[0]["resume"], "retour à la version 1")

    def test_archive_saved_and_order(self):
        cp.create("c1", "a", self.content("A"))
        cp.create("c1", "b", self.content("B"))
        cp.set_archived("c1", ["a"], True)
        self.assertEqual([p["key"] for p in cp.list_procedures("c1", include_archived=False)], ["b"])
        cp.link_saved("c1", "b", "wf-9")
        cp.add_version(cp.get("c1", "b"), self.content("B", WF[:2]), "modification")
        b = cp.current("c1", "b")
        self.assertEqual((b["workflow_db_id"], b["saved_version"], b["version"]), ("wf-9", 1, 2))  # modifiée depuis

    def test_existing_conversation_is_taken_over_once(self):
        conv = {"id": "c1", "state": {"procedures": [{"key": "x", **self.content("X")},
                                                     {"key": "y", **self.content("Y"), "archived": True}]}}
        self.assertTrue(cp.ensure_seeded(conv))
        self.assertFalse(cp.ensure_seeded(conv))
        procs = cp.list_procedures("c1")
        self.assertEqual([(p["key"], p["archived"], p["version"]) for p in procs], [("x", False, 1), ("y", True, 1)])
        self.assertEqual(cp.versions("c1", "x")[0]["origine"], "reprise")

    def test_unavailable_without_tables_or_when_switched_off(self):
        with mock.patch.dict(os.environ, {"CONVERSATION_PROCEDURES_SERVEUR": "false"}):
            self.assertFalse(cp.available())
        cp._available.clear()
        self.assertTrue(cp.available())
        cp._available.clear()
        with mock.patch.object(cp, "_db", side_effect=RuntimeError("relation does not exist")):
            self.assertFalse(cp.available())

    # ── fin d'un tour du chat ──
    def recorder(self, events):
        r = TurnRecorder()
        for ev in events:
            r.feed(ev)
        return r

    def test_turn_writes_generated_and_archived(self):
        cp.create("c1", "old", self.content("Organiser"))
        r = self.recorder([
            {"type": "procedure_ready", "id": "p1", "title": "Alternance – Organisation", "workflow": WF},
            {"type": "procedure_ready", "id": "p2", "title": "Plan – Organisation", "workflow": WF[:3]},
            {"type": "procedures_archived", "keys": ["old"], "titles": ["Organiser"], "by": []},
        ])
        procs = turn_procedures.persist("c1", r, "msg-9", {"client_message_id": "m42", "author": "u1"})
        active = [(p["key"], p["title"]) for p in procs if not p["archived"]]
        self.assertEqual(active, [("m42:p1", "Alternance – Organisation"), ("m42:p2", "Plan – Organisation")])
        self.assertTrue(next(p for p in procs if p["key"] == "old")["archived"])

    def test_turn_applies_the_modification_itself(self):
        cp.create("c1", "k", self.content())
        r = self.recorder([{"type": "target_procedure", "key": "k", "title": "Credoc"},
                           {"type": "chat_result", "result": {"intent": "patch", "explanation": "Le superviseur valide.",
                                                              "operations": [{"type": "update", "id": "3",
                                                                              "fields": {"acteur": "Superviseur"}}]}}])
        procs = turn_procedures.persist("c1", r, "msg-2", {"active": "autre"})
        k = next(p for p in procs if p["key"] == "k")
        self.assertEqual((k["version"], k["workflow"][2]["acteur"]), (2, "Superviseur"))
        self.assertEqual(cp.versions("c1", "k")[0]["resume"], "Le superviseur valide.")

    def test_turn_chat_creation_and_rewrite(self):
        cp.create("c1", "k", self.content())
        r = self.recorder([{"type": "chat_result", "result": {"intent": "generate", "title": "Compte étudiant – Ouverture",
                                                              "workflow": WF}}])
        turn_procedures.persist("c1", r, "msg-3", {"client_message_id": "m7"})
        self.assertEqual(cp.current("c1", "m7:chat")["title"], "Compte étudiant – Ouverture")
        r = self.recorder([{"type": "chat_result", "result": {"intent": "regen", "title": "Credoc", "workflow": WF[:2]}}])
        turn_procedures.persist("c1", r, "msg-4", {"client_message_id": "m8", "active": "k"})
        self.assertEqual((cp.current("c1", "k")["version"], cp.versions("c1", "k")[0]["origine"]), (2, "reecriture"))
        self.assertIsNone(cp.get("c1", "m8:chat"))

    def test_old_screen_sync_only_records_real_changes(self):
        from routers.conversations_router import _sync_from_screen
        cp.create("c1", "k", self.content())
        same = {"key": "k", **cp.current("c1", "k")}
        _sync_from_screen("c1", [same], "u1")
        self.assertEqual(cp.current("c1", "k")["version"], 1)
        _sync_from_screen("c1", [{**same, "workflow": WF[:2]}, {"key": "new", **self.content("N")}], "u1")
        self.assertEqual(cp.current("c1", "k")["version"], 2)
        self.assertEqual(cp.versions("c1", "k")[0]["origine"], "manuel")
        self.assertIsNotNone(cp.get("c1", "new"))
        _sync_from_screen("c1", [{**cp.current("c1", "k"), "key": "k", "archived": True}], "u1")
        self.assertTrue(cp.current("c1", "k")["archived"])


if __name__ == "__main__":
    unittest.main()
