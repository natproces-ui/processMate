"""La copie du chat face au référentiel : le chat dit la version qu'il a et demande, au lieu d'écraser en silence."""
import copy
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from manager import conversation_procedures as cp  # noqa: E402
from manager import referential_sync as rs  # noqa: E402
from tests.fake_db import FakeDB  # noqa: E402
from tests.test_conversation_procedures import WF  # noqa: E402


class ReferentialSyncTest(unittest.TestCase):
    def setUp(self):
        self.db = FakeDB({"conversations": [{"id": "c1", "owner_id": "u1", "state": {}}]},
                         unique={"conversation_procedure_versions": [("procedure_id", "version")],
                                 "conversation_procedures": [("conversation_id", "key")]})
        self.p = mock.patch.object(cp, "_db", return_value=self.db)
        self.p.start()
        cp._available.clear()
        self.ref = {"id": "wf-1", "title": "Credoc", "workflow_json": copy.deepcopy(WF),
                    "enrichments_json": {"2": {"descriptif": "Vérifier la demande"}, "__bpmn_xml__": "<xml/>"},
                    "procedure_metadata_json": {"nom": "Credoc", "last_modified_at": "2026-11-24T15:30:00"}}
        self.key = cp.attach("c1", self.ref, "u1")
        self.read = lambda wid: self.ref if wid == "wf-1" else None

    def tearDown(self):
        self.p.stop()

    def test_a_jour_rien_a_dire(self):
        self.assertEqual(rs.check("c1", [self.key], self.read), [])
        # un changement qui ne touche pas au contenu (statut, circuit, logigramme retouché) ne compte pas
        self.ref["procedure_metadata_json"]["status"] = "Validée"
        self.ref["enrichments_json"]["__bpmn_xml__"] = "<autre/>"
        self.assertEqual(rs.check("c1", [self.key], self.read), [])

    def test_referentiel_modifie_ailleurs(self):
        self.ref["workflow_json"][2]["acteur"] = "Superviseur"      # un collègue a changé une étape
        stale = rs.check("c1", [self.key], self.read)
        self.assertEqual(len(stale), 1)
        self.assertFalse(stale[0]["unsaved"])
        text = rs.question(stale)
        self.assertIn("Ma copie de « Credoc »", text)
        self.assertIn("le référentiel a été modifié depuis", text)
        self.assertIn("Je reprends la version à jour", text)

    def test_reprendre_la_version_a_jour(self):
        self.ref["enrichments_json"]["2"]["descriptif"] = "Nouvelle description"
        proc = rs.reprendre("c1", self.key, self.ref, "u1")
        self.assertEqual(proc["enrichments"]["2"]["descriptif"], "Nouvelle description")
        self.assertEqual(proc["version"], 2)                         # nouvelle version : l'ancienne reste dans l'historique
        self.assertEqual(proc["saved_version"], 2)
        self.assertEqual(rs.check("c1", [self.key], self.read), [])

    def test_garder_la_mienne_ne_redemande_pas(self):
        self.ref["workflow_json"][1]["étape"] = "Contrôler"
        fp = rs.check("c1", [self.key], self.read)[0]["fingerprint"]
        self.assertEqual(rs.check("c1", [self.key], self.read, {self.key: fp}), [])
        self.ref["workflow_json"][1]["étape"] = "Contrôler encore"   # le référentiel bouge de nouveau : on redemande
        self.assertEqual(len(rs.check("c1", [self.key], self.read, {self.key: fp})), 1)

    def test_modifications_du_chat_non_enregistrees(self):
        proc = cp.get("c1", self.key)
        cp.add_version(proc, {**cp.current("c1", self.key), "title": "Credoc"}, "modification")
        self.assertEqual(rs.check("c1", [self.key], self.read), [])  # seul le chat a changé : rien à demander
        self.ref["workflow_json"][0]["étape"] = "Réception SWIFT"
        stale = rs.check("c1", [self.key], self.read)
        self.assertTrue(stale[0]["unsaved"])
        self.assertIn("pas encore enregistrées", rs.question(stale))

    def test_sans_lien_ou_supprimee(self):
        self.assertEqual(rs.check("c1", ["inconnue", None], self.read), [])
        self.assertEqual(rs.check("c1", [self.key], lambda wid: None), [])


    def test_le_tour_demande_avant_d_agir(self):
        from processor.studio_planner import StudioPlan
        from routers import studio_router as sr
        self.ref["workflow_json"][2]["acteur"] = "Superviseur"
        procs = cp.list_procedures("c1", False)
        conv = {"id": "c1", "state": {}}
        with mock.patch.object(sr, "_read_workflow", self.read):
            edit = StudioPlan(action="edit", reply="", target=1)
            self.assertEqual(len(sr._stale_for_plan(edit, conv, procs, [], None)), 1)
            # créer le TO BE part du référentiel à jour ; répondre ne touche à rien : pas de question
            self.assertEqual(sr._stale_for_plan(StudioPlan(action="tobe", reply="", target=1), conv, procs, [], None), [])
            self.assertEqual(sr._stale_for_plan(StudioPlan(action="answer", reply="ok"), conv, procs, [], None), [])
            # « garder la mienne » retenu dans l'état de la conversation
            fp = rs.check("c1", [self.key], self.read)[0]["fingerprint"]
            self.assertEqual(sr._stale_for_plan(edit, {"id": "c1", "state": {"ref_ack": {self.key: fp}}}, procs, [], None), [])


if __name__ == "__main__":
    unittest.main()
