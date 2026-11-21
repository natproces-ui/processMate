"""Campagne guidée (accueil de l'organisation) : RACI proposé, création d'un coup, lancement."""
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from manager import access_control as ac, auth  # noqa: E402
from manager.auth import AuthUser  # noqa: E402
from tests.fake_db import FakeDB  # noqa: E402

A = "org-a"


def wf(wid, nom, tax):
    return {"id": wid, "organisation_id": A, "session_id": f"s-{wid}", "version": 1, "title": nom, "taxonomy_id": tax,
            "procedure_metadata_json": {"nom": nom, "lifecycle_stages": []}, "workflow_json": []}


def world():
    return FakeDB({
        "organisations": [{"id": A, "nom": "A", "statut": "active"}],
        "organisation_members": [{"organisation_id": A, "user_id": u, "role": r, "statut": "active"}
                                 for u, r in {"pilote": "pilote", "redac": "contributeur", "autre": "contributeur"}.items()],
        "user_profiles": [{"id": u, "email": f"{u}@x.com", "full_name": u.capitalize()} for u in ("pilote", "redac", "autre")],
        "process_taxonomy": [
            {"id": "t-ep", "organisation_id": A, "parent_id": None, "name": "Épargne", "level": "theme"},
            {"id": "t-liv", "organisation_id": A, "parent_id": "t-ep", "name": "Livrets", "level": "category"},
            {"id": "t-cr", "organisation_id": A, "parent_id": None, "name": "Crédit", "level": "theme"}],
        "workflows": [wf("w1", "Ouvrir un livret", "t-liv"), wf("w2", "Clôturer un livret", "t-liv"), wf("w3", "Octroyer un crédit", "t-cr")],
        "procedure_assignments": [
            {"organisation_id": A, "procedure_id": "w2", "user_id": "autre", "raci_role": "R"},
            {"organisation_id": A, "procedure_id": "w2", "user_id": "autre", "raci_role": "A"}],
        "equipes": [{"id": "eq", "organisation_id": A, "nom": "Back office épargne", "responsable_id": "redac"}],
        "equipe_branches": [{"organisation_id": A, "equipe_id": "eq", "taxonomy_id": "t-ep"}],
        "formalization_campaigns": [{"id": "old", "organisation_id": A, "title": "Crédit 2026", "status": "active", "coordinator_id": "pilote"}],
        "campaign_procedures": [{"id": "s-old", "organisation_id": A, "campaign_id": "old", "procedure_id": "w3", "procedure_nom": "Octroyer un crédit", "status": "pending"}],
        "procedure_tasks": [], "sessions": [], "procedure_events": [], "procedure_task_events": [],
        "procedure_notifications": [], "audit_log": [],
    })


class WizardTest(unittest.TestCase):
    def setUp(self):
        self.db = world()
        ac.forget_profile()
        auth._cache.clear()
        env = {"ORGANISATIONS_ENABLED": "true", "AUTH_MODE": "enforce", "CAMPAIGN_SLOTS_ENABLED": "true",
               "CONVERSATIONS_ENABLED": "false"}
        for p in (mock.patch.dict(os.environ, env), mock.patch("database.supabase_client.get_raw_supabase", return_value=self.db)):
            p.start()
            self.addCleanup(p.stop)
        self.client = TestClient(main.app)
        self._user = None
        for target in ("manager.access_control._verify", "manager.auth._verify"):
            p = mock.patch(target, side_effect=lambda _t: self._user)
            p.start()
            self.addCleanup(p.stop)

    def as_(self, uid):
        self._user = AuthUser(id=uid, email=f"{uid}@x.com", email_confirmed=True)
        return {"Authorization": "Bearer t"}

    def test_suggested_raci(self):
        r = self.client.post("/api/campaigns/guidee/proposition", headers=self.as_("pilote"),
                             json={"procedure_ids": ["w1", "w2", "w3"], "coordinator_id": "pilote"})
        self.assertEqual(r.status_code, 200, r.text)
        by = {p["procedure_id"]: p for p in r.json()["procedures"]}
        # w1 : pas de RACI → équipe de la branche parente (Épargne) en R, le pilote en A
        self.assertEqual((by["w1"]["source"], by["w1"]["raci"]["R"], by["w1"]["raci"]["A"]), ("equipe", ["redac"], "pilote"))
        self.assertEqual((by["w1"]["chemin"], by["w1"]["equipe"]), ("Épargne › Livrets", "Back office épargne"))
        # w2 : son propre RACI
        self.assertEqual((by["w2"]["source"], by["w2"]["raci"]["R"], by["w2"]["raci"]["A"]), ("procedure", ["autre"], "autre"))
        # w3 : aucune équipe, déjà dans une campagne ouverte
        self.assertEqual((by["w3"]["source"], by["w3"]["raci"]["R"], by["w3"]["deja_en_campagne"]), ("aucune", [], ["Crédit 2026"]))

    def test_contributor_cannot(self):
        r = self.client.post("/api/campaigns/guidee", headers=self.as_("redac"),
                             json={"title": "X", "procedures": [{"procedure_id": "w1"}]})
        self.assertEqual(r.status_code, 403)

    def test_create_and_launch(self):
        body = {"title": "Épargne 2027", "end_date": "2027-06-30", "coordinator_id": "pilote", "lancer": True,
                "procedures": [{"procedure_id": "w1", "raci": {"R": ["redac"], "A": "pilote", "C": [], "I": []}},
                               {"procedure_id": "w2", "raci": {"R": ["autre"], "A": "autre", "C": [], "I": []}}]}
        r = self.client.post("/api/campaigns/guidee", headers=self.as_("pilote"), json=body)
        self.assertEqual(r.status_code, 200, r.text)
        out = r.json()
        self.assertTrue(out["lancee"], out)
        self.assertEqual(out["campaign"]["status"], "active")
        cid = out["campaign"]["id"]
        slots = [s for s in self.db.rows("campaign_procedures") if s["campaign_id"] == cid]
        self.assertEqual(sorted(s["procedure_id"] for s in slots), ["w1", "w2"])
        roles = {(a["procedure_id"], a["user_id"], a["raci_role"]) for a in self.db.rows("procedure_assignments")}
        self.assertIn(("w1", "redac", "R"), roles)
        self.assertIn(("w1", "pilote", "A"), roles)
        tasks = [t for t in self.db.rows("procedure_tasks") if (t.get("metadata") or {}).get("campaign_id") == cid]
        self.assertEqual(sorted(t["assigned_to"] for t in tasks), ["autre", "redac"])  # « Formaliser » pour chaque R

    def test_launch_refused_keeps_draft_with_reasons(self):
        body = {"title": "Sans échéance", "coordinator_id": "pilote", "lancer": True,
                "procedures": [{"procedure_id": "w3", "raci": {"R": [], "A": "pilote", "C": [], "I": []}}]}
        out = self.client.post("/api/campaigns/guidee", headers=self.as_("pilote"), json=body).json()
        self.assertFalse(out["lancee"])
        self.assertEqual(out["campaign"]["status"], "draft")
        text = str(out["problemes"])
        self.assertIn("échéance", text)
        self.assertIn("aucun R", text)

    def test_bad_raci_creates_nothing(self):
        before = len(self.db.rows("formalization_campaigns"))
        r = self.client.post("/api/campaigns/guidee", headers=self.as_("pilote"), json={
            "title": "X", "procedures": [{"procedure_id": "w1", "raci": {"R": ["inconnu"], "A": "pilote"}}]})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(len(self.db.rows("formalization_campaigns")), before)


if __name__ == "__main__":
    unittest.main()
