"""Emplacements de campagne (prompt 5) : création, doublons, RACI, rattachement, lancement."""
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
from tests.fake_db import FakeDB  # noqa: E402

A, B = "org-a", "org-b"


def world():
    meta = lambda nom, ref="": {"nom": nom, "ref": ref, "lifecycle_stages": []}  # noqa: E731
    return FakeDB({
        "organisations": [{"id": A, "nom": "A", "statut": "active"}, {"id": B, "nom": "B", "statut": "active"}],
        "organisation_members": [
            {"organisation_id": A, "user_id": "pilote", "role": "pilote", "statut": "active"},
            {"organisation_id": A, "user_id": "redac", "role": "contributeur", "statut": "active"},
            {"organisation_id": A, "user_id": "valid", "role": "contributeur", "statut": "active"},
            {"organisation_id": B, "user_id": "bob", "role": "admin", "statut": "active"},
        ],
        "user_profiles": [{"id": u, "email": f"{u}@x.com", "full_name": u.capitalize()} for u in ("pilote", "redac", "valid", "bob")],
        "formalization_campaigns": [{"id": "camp", "organisation_id": A, "title": "Épargne", "status": "draft",
                                     "coordinator_id": "pilote", "end_date": "2026-12-31"}],
        "campaign_procedures": [],
        "workflows": [{"id": "w-exist", "organisation_id": A, "session_id": "s1", "version": 1, "title": "Ouvrir un livret",
                       "procedure_metadata_json": meta("Ouvrir un livret", "EP-01"), "workflow_json": [], "taxonomy_id": "br-ep"}],
        "process_taxonomy": [{"id": "br-ep", "organisation_id": A, "name": "Épargne"}],
        "equipes": [{"id": "eq", "organisation_id": A, "nom": "Back office épargne", "responsable_id": "redac"}],
        "equipe_branches": [{"organisation_id": A, "equipe_id": "eq", "taxonomy_id": "br-ep"}],
        "procedure_assignments": [], "procedure_tasks": [], "sessions": [], "procedure_events": [],
        "procedure_task_events": [], "procedure_notifications": [], "audit_log": [],
    })


class SlotsTest(unittest.TestCase):
    def setUp(self):
        self.db = world()
        ac.forget_profile()
        auth._cache.clear()
        env = {"ORGANISATIONS_ENABLED": "true", "AUTH_MODE": "enforce", "CAMPAIGN_SLOTS_ENABLED": "true",
               "CONVERSATIONS_ENABLED": "false"}
        for p in (mock.patch.dict(os.environ, env),
                  mock.patch("database.supabase_client.get_raw_supabase", return_value=self.db)):
            p.start()
            self.addCleanup(p.stop)
        self.client = TestClient(main.app)
        self.h = self.as_("pilote")

    def as_(self, uid):
        user = AuthUser(id=uid, email=f"{uid}@x.com", email_confirmed=True)
        for p in (mock.patch.object(ac, "_verify", return_value=user), mock.patch("manager.auth._verify", return_value=user)):
            p.start()
            self.addCleanup(p.stop)
        ac.forget_profile()
        return {"Authorization": "Bearer t"}

    def add(self, entries, force=False, headers=None):
        return self.client.post("/api/campaigns/camp/emplacements", json={"entries": entries, "force": force},
                                headers=headers or self.h)

    def slots(self):
        return self.client.get("/api/campaigns/camp/emplacements", headers=self.h).json()

    def test_slot_without_procedure_and_default_raci(self):
        r = self.add([{"titre": "Clôturer un livret", "taxonomy_id": "br-ep", "origine": "saisie"}])
        self.assertEqual(r.status_code, 200, r.text)
        slot = self.slots()["emplacements"][0]
        self.assertIsNone(slot["procedure_id"])
        self.assertEqual(slot["equipe_id"], "eq")                                   # équipe de la branche
        self.assertEqual((slot["raci"]["R"], slot["raci"]["A"]), (["redac"], "pilote"))  # responsable, pilote
        self.assertEqual(self.db.rows("campaign_procedures")[0]["organisation_id"], A)

    def test_duplicates_reported_then_forced(self):
        r = self.add([{"titre": "Ouvrir un LIVRET"}]).json()
        self.assertEqual(r["created"], [])
        self.assertEqual(r["doublons"][0]["ou"], "referentiel")
        r = self.add([{"titre": "Ouvrir un LIVRET"}], force=True).json()
        self.assertEqual(len(r["created"]), 1)
        r = self.add([{"titre": "ouvrir un livret"}], force=True).json()   # jamais deux fois dans la campagne
        self.assertEqual(r["created"], [])

    def test_existing_procedure_slot_puts_raci_on_procedure(self):
        self.add([{"procedure_id": "w-exist"}], force=True)
        slot = self.slots()["emplacements"][0]
        self.assertEqual(slot["procedure_nom"], "Ouvrir un livret")
        self.assertIsNone(self.db.rows("campaign_procedures")[0]["raci"])
        self.assertEqual(slot["raci"]["A"], "pilote")
        self.assertTrue(any(a["raci_role"] == "A" for a in self.db.rows("procedure_assignments")))

    def test_raci_transferred_on_link(self):
        self.add([{"titre": "Transférer", "raci": {"R": ["redac"], "A": "valid", "C": [], "I": []}}])
        sid = self.slots()["emplacements"][0]["id"]
        r = self.client.patch(f"/api/campaigns/camp/emplacements/{sid}", json={"procedure_id": "w-exist"}, headers=self.h)
        self.assertEqual(r.status_code, 200, r.text)
        row = self.db.rows("campaign_procedures")[0]
        self.assertIsNone(row["raci"])  # une seule source de vérité
        roles = {(a["user_id"], a["raci_role"]) for a in self.db.rows("procedure_assignments")}
        self.assertEqual(roles, {("redac", "R"), ("valid", "A")})

    def test_raci_must_be_org_members(self):
        self.add([{"titre": "X"}])
        sid = self.slots()["emplacements"][0]["id"]
        r = self.client.put("/api/campaigns/camp/emplacements/raci",
                            json={"ids": [sid], "raci": {"R": ["bob"], "A": "pilote"}}, headers=self.h)
        self.assertEqual(r.status_code, 400)

    def test_bulk_partial_raci(self):
        self.add([{"titre": "X"}, {"titre": "Y"}])
        ids = [s["id"] for s in self.slots()["emplacements"]]
        self.client.put("/api/campaigns/camp/emplacements/raci", json={"ids": ids, "raci": {"C": ["valid"]}, "partial": True}, headers=self.h)
        for s in self.slots()["emplacements"]:
            self.assertEqual((s["raci"]["C"], s["raci"]["A"]), (["valid"], "pilote"))

    def test_contributor_cannot_structure_campaign(self):
        r = self.add([{"titre": "X"}], headers=self.as_("redac"))
        self.assertEqual(r.status_code, 403)

    def test_launch_rules_then_launch(self):
        self.add([{"titre": "Sans R"}])
        r = self.client.post("/api/campaigns/camp/launch", headers=self.h)
        self.assertEqual(r.status_code, 400)
        self.assertIn("aucun R", str(r.json()))
        sid = self.slots()["emplacements"][0]["id"]
        self.client.put("/api/campaigns/camp/emplacements/raci", json={"ids": [sid], "raci": {"R": ["redac"], "A": "valid"}}, headers=self.h)
        r = self.client.post("/api/campaigns/camp/launch", headers=self.h)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual((r.json()["procedures_creees"], r.json()["taches_creees"]), (1, 1))
        row = self.db.rows("campaign_procedures")[0]
        wf = next(w for w in self.db.rows("workflows") if w["id"] == row["procedure_id"])
        self.assertEqual((wf["title"], wf["organisation_id"]), ("Sans R", A))   # procédure vide créée
        task = self.db.rows("procedure_tasks")[0]
        self.assertEqual((task["assigned_to"], task["task_type"], task["procedure_id"]), ("redac", "formalization", wf["id"]))
        self.assertEqual(self.db.rows("formalization_campaigns")[0]["status"], "active")
        self.assertEqual(self.client.post("/api/campaigns/camp/launch", headers=self.h).status_code, 409)

    def test_launch_requires_deadline(self):
        self.db.rows("formalization_campaigns")[0]["end_date"] = None
        problems = self.slots()["problemes_lancement"]
        self.assertTrue(any("échéance" in p["probleme"] for p in problems))

    def test_from_document_proposes_only(self):
        plan = SimpleNamespace(procedures=[{"title": "Organiser la formation"}, {"title": "Ouvrir un livret"}])
        with mock.patch("processor.studio_planner.plan_turn", return_value=plan):
            r = self.client.post("/api/campaigns/camp/emplacements/depuis-document", headers=self.h,
                                 files={"files": ("deck.pdf", b"%PDF-1.4 /Type /Page", "application/pdf")})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual([c["titre"] for c in r.json()["candidats"]], ["Organiser la formation", "Ouvrir un livret"])
        self.assertEqual(r.json()["doublons"][0]["titre"], "Ouvrir un livret")
        self.assertEqual(self.db.rows("campaign_procedures"), [])  # rien de créé

    def test_disabled_flag_hides_routes(self):
        with mock.patch.dict(os.environ, {"CAMPAIGN_SLOTS_ENABLED": "false"}):
            self.assertEqual(self.client.get("/api/campaigns/camp/emplacements", headers=self.h).status_code, 404)


if __name__ == "__main__":
    unittest.main()
