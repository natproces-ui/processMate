"""AS IS / TO BE : un même processus en deux versions."""
import asyncio
import unittest
from unittest import mock

from tests.fake_db import FakeDB  # noqa: E402
from routers import orchestration_router as orch  # noqa: E402

STEPS = [{"id": "1", "étape": "Début", "typeBpmn": "StartEvent", "acteur": "Agence", "outputs": [{"targetId": "2"}]},
         {"id": "2", "étape": "Contrôler", "typeBpmn": "Task", "acteur": "Agence", "outputs": []}]


def make_db():
    return FakeDB({
        "workflows": [{"id": "asis", "session_id": "s1", "title": "Contrôle", "version": 1, "created_at": "2026-11-20T00:00:00Z",
                       "taxonomy_id": "sp07", "workflow_json": STEPS, "enrichments_json": {"2": {"descriptif": "x"}},
                       "procedure_metadata_json": {"nom": "Contrôle", "status": "Validée", "validation": {"ok": 1},
                                                   "raci": {"people": ["p"], "matrix": {}}, "remarks": [{"id": "r"}]}}],
        "sessions": [{"id": "s1", "title": "Contrôle"}], "procedure_events": [], "procedure_versions": [],
    })


class TobeTest(unittest.TestCase):
    def setUp(self):
        self.db = make_db()
        self.patches = [mock.patch.object(orch, "get_supabase", return_value=self.db),
                        mock.patch("manager.save_targets.enforce_write", lambda *a, **k: None),
                        mock.patch("manager.version_store._db", return_value=self.db),
                        mock.patch.dict("os.environ", {"VERSIONS_ENABLED": "true"})]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def create(self):
        return asyncio.run(orch.create_tobe("asis", request=None, user=None))

    def test_copie_de_l_asis(self):
        res = self.create()
        self.assertTrue(res["created"])
        tobe = res["procedure"]
        self.assertEqual(tobe["asis_id"], "asis")
        self.assertEqual([r["id"] for r in tobe["workflow_json"]], ["1", "2"])  # mêmes identifiants : origine connue
        self.assertEqual(tobe["status"], "Brouillon")
        self.assertNotIn("validation", tobe["metadata"])
        self.assertEqual(tobe["metadata"]["remarks"], [])
        self.assertEqual(tobe["raci"]["people"], ["p"])  # mêmes responsables au départ
        self.assertEqual(tobe["taxonomy_id"], "sp07")
        self.assertEqual(len(self.db.rows("procedure_versions")), 1)

    def test_une_seule_version_tobe(self):
        first = self.create()["procedure"]["id"]
        again = self.create()
        self.assertFalse(again["created"])
        self.assertEqual(again["procedure"]["id"], first)

    def test_listes_sans_le_tobe(self):
        tobe_id = self.create()["procedure"]["id"]
        rows = orch._get_latest_workflows()
        self.assertEqual([r["id"] for r in rows], ["asis"])  # le TO BE n'est pas une procédure à part
        built = orch._build_procedure(rows[0])
        self.assertEqual(built["tobe_id"], tobe_id)
        self.assertEqual(built["tobe_status"], "Brouillon")

    def test_paire_depuis_l_une_ou_l_autre(self):
        self.assertIsNone(asyncio.run(orch.get_tobe("asis"))["tobe"])
        tobe_id = self.create()["procedure"]["id"]
        for start in ("asis", tobe_id):
            pair = asyncio.run(orch.get_tobe(start))
            self.assertEqual(pair["asis"]["id"], "asis")
            self.assertEqual(pair["tobe"]["id"], tobe_id)

    def test_pas_de_tobe_d_un_tobe(self):
        tobe_id = self.create()["procedure"]["id"]
        with self.assertRaises(Exception):
            asyncio.run(orch.create_tobe(tobe_id, request=None, user=None))


class TobeParLeChatTest(unittest.TestCase):
    """« Fais le TO BE » dans le chat : créé au référentiel, ajouté au chat, l'AS IS y reste."""

    def setUp(self):
        self.db = make_db()
        self.db.tables.setdefault("irritants", []).append({"id": "i1", "titre": "Pièces dispersées", "procedure_id": "asis"})
        self.db.tables.setdefault("findings", []).append({"id": "f1", "irritant_id": "i1", "categorie": "T1 : Dossier continu",
                                                           "etapes": ["2"], "constat": "Pièces renvoyées par mail", "ordre": 0})
        self.db.tables.setdefault("pistes", []).extend([
            {"id": "p1", "finding_id": "f1", "titre": "Rattacher dès réception", "description": "Un dossier unique.", "statut": "retenue", "ordre": 0},
            {"id": "p2", "finding_id": "f1", "titre": "Tout ressaisir", "description": "Non.", "statut": "rejetée", "ordre": 1}])
        self.attached = []
        self.delegated = []
        from routers import studio_router as sr
        self.sr = sr

        async def fake_delegate(message, *a, **k):
            self.delegated.append((message, k.get("target_key"), k.get("intent")))
            yield sr._sse({"type": "message", "text": "TO BE mis à niveau."})

        self.patches = [mock.patch.object(orch, "get_supabase", return_value=self.db),
                        mock.patch("manager.tobe_material.get_supabase", return_value=self.db),
                        mock.patch("manager.save_targets.enforce_write", lambda *a, **k: None),
                        mock.patch("manager.version_store._db", return_value=self.db),
                        mock.patch.dict("os.environ", {"VERSIONS_ENABLED": "true"}),
                        mock.patch.object(sr.cp, "attach", lambda conv, wf, author=None: self.attached.append(wf["id"]) or f"ref:{wf['id']}"),
                        mock.patch.object(sr.cp, "list_procedures", lambda *a, **k: []),
                        mock.patch.object(sr, "_delegate_to_chat", fake_delegate)]
        for x in self.patches:
            x.start()

    def tearDown(self):
        for x in self.patches:
            x.stop()

    def run_turn(self, target, then_edit=False, conv={"id": "c1"}):
        sess = {}
        async def collect():
            return [ev async for ev in self.sr._tobe_turn(target, conv, None, None, then_edit, "Fais le TO BE", [], [], sess)]
        return "".join(asyncio.run(collect())), sess

    ASIS = {"key": "k-asis", "title": "Contrôle", "workflow_db_id": "asis", "procedureMetadata": {"nom": "Contrôle"}, "version": 2, "saved_version": 2}

    def test_cree_et_ajoute_au_chat(self):
        out, _ = self.run_turn(self.ASIS)
        tobe = [w for w in self.db.rows("workflows") if (w.get("procedure_metadata_json") or {}).get("asis_id") == "asis"]
        self.assertEqual(len(tobe), 1)
        self.assertEqual(self.attached, [tobe[0]["id"]])            # seul le TO BE est ajouté ; l'AS IS reste
        self.assertIn('"procedure_focus"', out)
        self.assertIn("L'AS IS y reste", out)
        self.assertEqual(self.delegated, [])                         # rien d'autre demandé

    def test_mise_a_niveau_avec_les_pistes_retenues(self):
        _, sess = self.run_turn(self.ASIS, then_edit=True)
        message, key, intent = self.delegated[0]
        self.assertEqual(intent, "patch")
        self.assertTrue(key.startswith("ref:"))
        self.assertEqual(sess["_turn"]["target_key"], key)           # la modification est écrite dans le TO BE
        self.assertIn("Rattacher dès réception", message)
        self.assertNotIn("Tout ressaisir", message)                  # une piste rejetée n'est pas appliquée

    def test_mettre_a_niveau_le_tobe_existant(self):
        self.run_turn(self.ASIS)                                     # le TO BE existe et est dans le chat
        tobe_id = self.attached[0]
        tobe = {"key": f"ref:{tobe_id}", "title": "Contrôle", "workflow_db_id": tobe_id, "procedureMetadata": {"asis_id": "asis"}}
        self.run_turn(tobe, then_edit=True)                          # « mets le TO BE à niveau avec les pistes »
        self.assertEqual(self.attached, [tobe_id, tobe_id])          # le même TO BE, pas un second
        self.assertIn("Rattacher dès réception", self.delegated[0][0])

    def test_modifications_non_enregistrees_signalees(self):
        out, _ = self.run_turn({**self.ASIS, "version": 3})
        self.assertIn("modifications non enregistrées", out)

    def test_refus_explicites(self):
        out, _ = self.run_turn({**self.ASIS, "workflow_db_id": None})
        self.assertIn("Enregistrez d'abord", out)
        out, _ = self.run_turn({**self.ASIS, "procedureMetadata": {"asis_id": "x"}})
        self.assertIn("déjà le TO BE", out)
        out, _ = self.run_turn(self.ASIS, conv=None)
        self.assertIn("conversation enregistrée", out)
        self.assertEqual(self.attached, [])

    def test_aiguillage(self):
        from processor.studio_planner import apply_guardrails
        plan = apply_guardrails({"action": "tobe", "cible": 1, "puis_modifier": True}, [], False, conversation_titles=["Contrôle"])
        self.assertEqual((plan.action, plan.target, plan.then_edit), ("tobe", 1, True))
        plan = apply_guardrails({"action": "tobe"}, [], False)
        self.assertEqual(plan.action, "answer")                      # pas de procédure : rien à copier


if __name__ == "__main__":
    unittest.main()
