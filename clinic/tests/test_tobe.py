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


if __name__ == "__main__":
    unittest.main()
