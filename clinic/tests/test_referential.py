"""« Partir de mes sources » : proposition de référentiel dans le chat, puis application."""
import asyncio
import io
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from manager import access_control as ac, auth  # noqa: E402
from manager.auth import AuthUser  # noqa: E402
from manager.turn_recorder import TurnRecorder  # noqa: E402
from processor import referential_builder as rb  # noqa: E402
from processor.office_extract import extract_office, office_type  # noqa: E402
from processor.studio_planner import apply_guardrails  # noqa: E402
from tests.fake_db import FakeDB  # noqa: E402

A = "org-a"

PROPOSAL = {
    "reply": "Je propose 2 thèmes et 4 procédures.",
    "titre": "Référentiel proposé",
    "arbre": [
        {"nom": "1. Épargne", "procedures": [], "enfants": [
            {"nom": "Livrets", "procedures": [{"nom": "Ouvrir un livret", "source": "carto.xlsx"}], "enfants": [
                {"nom": "Ouverture", "procedures": [], "enfants": [
                    {"nom": "Trop profond", "procedures": [{"nom": "Transférer un livret"}], "enfants": []}]}]},
            {"nom": "livrets", "procedures": [{"nom": "Clôturer un livret"}], "enfants": []}]},
        {"nom": "Crédit", "procedures": [{"nom": "Octroyer un crédit"}, {"nom": "octroyer un crédit"}], "enfants": []},
        {"nom": "  ", "procedures": [], "enfants": []},
    ],
    "remarques": [{"type": "manque", "texte": "Aucune procédure de clôture de compte."}, {"type": "autre", "texte": "Ordre conseillé."}],
}


class BuilderTest(unittest.TestCase):
    def test_tree_is_cleaned(self):
        p = rb.normalize(PROPOSAL)
        tree = p["arbre"]
        self.assertEqual([n["nom"] for n in tree], ["Épargne", "Crédit"])  # numérotation retirée, nom vide écarté
        livrets = tree[0]["enfants"]
        self.assertEqual(len(livrets), 1)  # « Livrets » et « livrets » réunis
        ouverture = livrets[0]["enfants"][0]
        self.assertEqual(ouverture["enfants"], [])  # 3 niveaux au plus…
        self.assertEqual(ouverture["procedures"], [{"nom": "Transférer un livret"}])  # …les procédures remontent
        # trois niveaux toujours : les procédures du thème Crédit descendent dans Général › Général
        self.assertEqual(tree[1]["procedures"], [])
        self.assertEqual(tree[1]["enfants"][0]["nom"], "Général")
        self.assertEqual(len(tree[1]["enfants"][0]["enfants"][0]["procedures"]), 1)  # doublon retiré
        # « Livrets » (catégorie) gardait 2 procédures : elles passent dans sa sous-catégorie Général
        self.assertEqual(livrets[0]["procedures"], [])
        self.assertEqual([x["nom"] for x in livrets[0]["enfants"][1]["procedures"]], ["Ouvrir un livret", "Clôturer un livret"])
        self.assertEqual(p["stats"], {"themes": 2, "categories": 2, "sous_categories": 3, "procedures": 4})
        self.assertEqual(p["remarques"][1]["type"], "conseil")

    def test_planner_keeps_structure_action(self):
        plan = apply_guardrails({"action": "structure", "reply": ""}, ["carto.xlsx"], False)
        self.assertEqual(plan.action, "structure")


class SourcesTest(unittest.TestCase):
    def test_excel_and_code_are_read(self):
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        ws.title = "Cartographie"
        ws.append(["Domaine", "Processus"])
        ws.append(["Épargne", "Ouvrir un livret"])
        buf = io.BytesIO()
        wb.save(buf)
        self.assertEqual(office_type("carto.xlsx"), "xlsx")
        text = extract_office(buf.getvalue(), "xlsx")["text"]
        self.assertIn("Feuille « Cartographie »", text)
        self.assertIn("| Épargne | Ouvrir un livret |", text)
        self.assertEqual(office_type("PAIE01.cbl"), "texte")
        self.assertIn("PROCEDURE DIVISION", extract_office("PROCEDURE DIVISION.".encode("cp1252"), "texte")["text"])
        self.assertIsNone(office_type("vieux.xls"))


class StreamTest(unittest.TestCase):
    def test_proposal_is_streamed_kept_and_recorded(self):
        from routers import studio_router
        sess = {"files": [], "proposal": None}

        async def go():
            with mock.patch.object(rb, "build", return_value=rb.normalize(PROPOSAL)):
                return [json.loads(c[6:]) async for c in studio_router._stream_structure(sess, [], "construis", [])]

        events = asyncio.run(go())
        kinds = [e["type"] for e in events]
        self.assertIn("referential_proposal", kinds)
        self.assertEqual(events[-1]["label"], "Référentiel proposé · 2 thèmes, 4 procédures")
        self.assertEqual(sess["referentiel"]["stats"]["procedures"], 4)  # gardée : le message suivant l'affine
        r = TurnRecorder()
        for e in events:
            r.feed(e)
        r.feed({"type": "done"})
        self.assertEqual(r.finish()["payload"]["referentiel"]["titre"], "Référentiel proposé")


class ApplyTest(unittest.TestCase):
    def setUp(self):
        self.db = FakeDB({
            "organisations": [{"id": A, "nom": "Banque A", "statut": "active", "parametres": {}}],
            "organisation_members": [{"organisation_id": A, "user_id": u, "role": r, "statut": "active"}
                                     for u, r in {"pilote": "pilote", "redac": "contributeur"}.items()],
            "user_profiles": [{"id": u, "email": f"{u}@a.com"} for u in ("pilote", "redac")],
            "process_taxonomy": [{"id": "t-ep", "organisation_id": A, "parent_id": None, "name": "Epargne", "level": "theme", "order_index": 0}],
            "workflows": [{"id": "w1", "organisation_id": A, "session_id": "s1", "title": "Ouvrir un livret", "taxonomy_id": "t-ep",
                           "procedure_metadata_json": {"nom": "Ouvrir un livret"}, "workflow_json": []}],
            "campaign_procedures": [], "formalization_campaigns": [], "sessions": [], "procedure_events": [], "audit_log": [],
        })
        ac.forget_profile()
        auth._cache.clear()
        for p in (mock.patch.dict(os.environ, {"ORGANISATIONS_ENABLED": "true", "AUTH_MODE": "enforce"}),
                  mock.patch("database.supabase_client.get_raw_supabase", return_value=self.db)):
            p.start()
            self.addCleanup(p.stop)
        self.client = TestClient(main.app)
        self._user = None
        for target in ("manager.access_control._verify", "manager.auth._verify"):
            p = mock.patch(target, side_effect=lambda _t: self._user)
            p.start()
            self.addCleanup(p.stop)

    def as_(self, uid):
        self._user = AuthUser(id=uid, email=f"{uid}@a.com", email_confirmed=True)
        return {"Authorization": "Bearer t"}

    def test_apply_merges_without_duplicates(self):
        tree = rb.normalize(PROPOSAL)["arbre"]
        self.assertEqual(self.client.post("/api/orchestration/referentiel/appliquer", json={"arbre": tree},
                                          headers=self.as_("redac")).status_code, 403)
        r = self.client.post("/api/orchestration/referentiel/appliquer", json={"arbre": tree}, headers=self.as_("pilote"))
        self.assertEqual(r.status_code, 200, r.text)
        out = r.json()
        # « Épargne » existe déjà (« Epargne ») : branche reprise ; « Crédit » créé
        self.assertEqual(out["crees"], {"themes": 1, "categories": 2, "sous_categories": 3, "procedures": 3})
        self.assertEqual(out["procedures_deja_presentes"], ["Ouvrir un livret"])
        themes = [n for n in self.db.rows("process_taxonomy") if n["level"] == "theme"]
        self.assertEqual(sorted(n["name"] for n in themes), ["Crédit", "Epargne"])
        cat = next(n for n in self.db.rows("process_taxonomy") if n["name"] == "Livrets")
        self.assertEqual((cat["parent_id"], cat["level"], cat["organisation_id"]), ("t-ep", "category", A))
        proc = next(w for w in self.db.rows("workflows") if w["title"] == "Transférer un livret")
        self.assertEqual(next(n for n in self.db.rows("process_taxonomy") if n["id"] == proc["taxonomy_id"])["name"], "Ouverture")
        # une seconde application ne crée rien
        again = self.client.post("/api/orchestration/referentiel/appliquer", json={"arbre": tree}, headers=self.as_("pilote")).json()
        self.assertEqual(again["crees"], {"themes": 0, "categories": 0, "sous_categories": 0, "procedures": 0})


if __name__ == "__main__":
    unittest.main()
