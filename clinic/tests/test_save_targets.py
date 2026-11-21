"""Enregistrer une procédure à sa place : campagnes comme dossiers, R/A, propositions."""
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from manager import access_control as ac, auth, save_targets  # noqa: E402
from manager.auth import AuthUser  # noqa: E402
from tests.fake_db import FakeDB  # noqa: E402

A = "org-a"
PEOPLE = {"pilote": "pilote", "redac": "contributeur", "autre": "contributeur", "lect": "lecteur"}


def wf(wid, nom, tax):
    return {"id": wid, "organisation_id": A, "session_id": f"s-{wid}", "version": 1, "title": nom, "taxonomy_id": tax,
            "procedure_metadata_json": {"nom": nom}, "workflow_json": [{"id": "1"}], "enrichments_json": {}}


def world():
    return FakeDB({
        "organisations": [{"id": A, "nom": "Banque A", "statut": "active", "parametres": {}}],
        "organisation_members": [{"organisation_id": A, "user_id": u, "role": r, "statut": "active"} for u, r in PEOPLE.items()],
        "user_profiles": [{"id": u, "email": f"{u}@a.com", "full_name": u.capitalize()} for u in PEOPLE],
        "process_taxonomy": [
            {"id": "t-epargne", "organisation_id": A, "parent_id": None, "name": "Épargne", "level": "theme", "order_index": 0},
            {"id": "t-livret", "organisation_id": A, "parent_id": "t-epargne", "name": "Livrets", "level": "category", "order_index": 0},
            {"id": "t-ouv", "organisation_id": A, "parent_id": "t-livret", "name": "Ouverture", "level": "subcategory", "order_index": 0},
            {"id": "t-credit", "organisation_id": A, "parent_id": None, "name": "Crédit", "level": "theme", "order_index": 1},
        ],
        "workflows": [wf("w1", "Ouvrir un livret", "t-ouv"), wf("w2", "Clôturer un livret", "t-livret"),
                      wf("w3", "Octroyer un crédit", "t-credit"), wf("w4", "Archiver un dossier", "t-livret")],
        "procedure_assignments": [
            {"organisation_id": A, "procedure_id": "w1", "user_id": "redac", "raci_role": "R"},
            {"organisation_id": A, "procedure_id": "w2", "user_id": "redac", "raci_role": "A"},
            {"organisation_id": A, "procedure_id": "w3", "user_id": "autre", "raci_role": "R"},
            {"organisation_id": A, "procedure_id": "w3", "user_id": "redac", "raci_role": "C"},
            {"organisation_id": A, "procedure_id": "w4", "user_id": "redac", "raci_role": "R"}],
        "formalization_campaigns": [
            {"id": "camp", "organisation_id": A, "title": "Épargne 2026", "status": "active", "coordinator_id": "pilote", "created_at": "2026-11-02"},
            {"id": "brouillon", "organisation_id": A, "title": "Crédit 2027", "status": "draft", "coordinator_id": "pilote", "created_at": "2026-11-03"},
            {"id": "close", "organisation_id": A, "title": "Ancienne", "status": "completed", "coordinator_id": "pilote", "created_at": "2026-01-01"}],
        "campaign_procedures": [
            {"id": "slot1", "organisation_id": A, "campaign_id": "camp", "procedure_id": "w1", "procedure_nom": "Ouvrir un livret", "status": "pending"},
            {"id": "slot3", "organisation_id": A, "campaign_id": "camp", "procedure_id": "w3", "procedure_nom": "Octroyer un crédit", "status": "pending"},
            {"id": "slot-vide", "organisation_id": A, "campaign_id": "brouillon", "procedure_id": None, "procedure_nom": "Racheter un crédit",
             "taxonomy_id": "t-credit", "status": "pending", "raci": {"R": ["redac"], "A": "pilote", "C": [], "I": []}},
            {"id": "slot4", "organisation_id": A, "campaign_id": "close", "procedure_id": "w4", "procedure_nom": "Archiver un dossier", "status": "validated"}],
        "sessions": [], "procedure_events": [], "procedure_tasks": [], "procedure_task_events": [], "procedure_notifications": [],
        "procedure_propositions": [], "audit_log": [], "procedure_versions": [],
    })


class SaveTargetsTest(unittest.TestCase):
    def setUp(self):
        self.db = world()
        ac.forget_profile()
        auth._cache.clear()
        self.env = mock.patch.dict(os.environ, {"ORGANISATIONS_ENABLED": "true", "AUTH_MODE": "enforce", "VERSIONS_ENABLED": "false"})
        for p in (self.env, mock.patch("database.supabase_client.get_raw_supabase", return_value=self.db)):
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

    def tree(self, uid, titre=None):
        r = self.client.get("/api/enregistrement/arbre", params={"titre": titre} if titre else None, headers=self.as_(uid))
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    # ── Ce que l'on voit ──

    def test_contributor_sees_only_where_r_or_a(self):
        t = self.tree("redac", "Ouverture d'un livret A")
        camps = {c["id"]: c for c in t["campagnes"]}
        self.assertEqual([e["procedure_id"] for e in camps["camp"]["emplacements"]], ["w1"])  # w3 : seulement C
        self.assertEqual([e["id"] for e in camps["brouillon"]["emplacements"]], ["slot-vide"])
        self.assertTrue(camps["close"]["lecture_seule"])
        self.assertFalse(camps["close"]["emplacements"][0]["ecriture"])
        # hors campagne ouverte : w2 (A) et w4 (sa campagne est close) ; pas w3
        self.assertEqual(sorted(o["procedure_id"] for o in t["hors_campagne"]), ["w2", "w4"])
        self.assertEqual(t["creation"], "proposition")
        self.assertEqual(t["suggestion"]["procedure_id"], "w1")
        self.assertEqual(t["suggestion"]["campaign_id"], "camp")
        # la taxonomie se limite aux branches où il travaille
        self.assertEqual({n["id"] for n in t["taxonomie"]}, {"t-epargne", "t-livret", "t-ouv", "t-credit"})

    def test_manager_sees_everything_and_creates(self):
        t = self.tree("pilote")
        camps = {c["id"]: c for c in t["campagnes"]}
        self.assertEqual({e["procedure_id"] for e in camps["camp"]["emplacements"]}, {"w1", "w3"})
        self.assertEqual(t["creation"], "directe")
        self.assertEqual(len(t["taxonomie"]), 4)

    def test_reader_sees_nothing_to_write(self):
        t = self.tree("lect")
        self.assertEqual(t["hors_campagne"], [])
        self.assertIsNone(t["creation"])

    def test_similarity(self):
        self.assertGreaterEqual(save_targets.similarity("Ouverture d'un livret", "Ouvrir un livret"), 0.5)
        self.assertEqual(save_targets.similarity("Octroyer un crédit", "Ouvrir un livret"), 0)

    # ── Ce que l'on peut enregistrer ──

    def save(self, uid, wid):
        return self.client.patch(f"/api/orchestration/procedures/{wid}/workflow",
                                 json={"workflow_json": [{"id": "1"}, {"id": "2"}]}, headers=self.as_(uid))

    def test_save_requires_r_or_a(self):
        self.assertEqual(self.save("redac", "w1").status_code, 200)
        self.assertEqual(self.save("redac", "w2").status_code, 200)  # A
        self.assertEqual(self.save("redac", "w3").status_code, 403)  # C seulement
        self.assertEqual(self.save("pilote", "w3").status_code, 200)

    def test_report_mode_only_logs(self):
        with mock.patch.dict(os.environ, {"AUTH_MODE": "report"}):
            self.assertEqual(self.save("redac", "w3").status_code, 200)

    # ── Taxonomie : structurée par le pilotage ──

    def test_taxonomy_is_structured_by_managers(self):
        body = {"name": "Assurance", "level": "theme"}
        self.assertEqual(self.client.post("/api/orchestration/taxonomy", json=body, headers=self.as_("redac")).status_code, 403)
        self.assertEqual(self.client.patch("/api/orchestration/taxonomy/t-ouv", json={"name": "x"}, headers=self.as_("redac")).status_code, 403)
        self.assertEqual(self.client.delete("/api/orchestration/taxonomy/t-ouv", headers=self.as_("redac")).status_code, 403)
        self.assertEqual(self.client.post("/api/orchestration/taxonomy/seed-bian", headers=self.as_("redac")).status_code, 403)
        r = self.client.post("/api/orchestration/taxonomy", json=body, headers=self.as_("pilote"))
        self.assertEqual(r.status_code, 200, r.text)
        # la disposition de la carte reste à tous (lecteur excepté : écriture)
        r = self.client.put("/api/orchestration/taxonomy/t-epargne/map", json={"layout": {}}, headers=self.as_("redac"))
        self.assertNotEqual(r.status_code, 403)

    # ── Emplacement sans procédure (campagne en brouillon) ──

    def test_empty_slot_gets_its_procedure(self):
        r = self.client.post("/api/enregistrement/emplacements/slot-vide", headers=self.as_("redac"))
        self.assertEqual(r.status_code, 200, r.text)
        pid = r.json()["procedure_id"]
        slot = next(s for s in self.db.rows("campaign_procedures") if s["id"] == "slot-vide")
        self.assertEqual((slot["procedure_id"], slot["status"]), (pid, "in_progress"))
        proc = next(w for w in self.db.rows("workflows") if w["id"] == pid)
        self.assertEqual((proc["title"], proc["taxonomy_id"]), ("Racheter un crédit", "t-credit"))
        roles = {(a["user_id"], a["raci_role"]) for a in self.db.rows("procedure_assignments") if a["procedure_id"] == pid}
        self.assertEqual(roles, {("redac", "R"), ("pilote", "A")})  # le RACI suit la procédure
        self.assertEqual(self.save("redac", pid).status_code, 200)

    def test_empty_slot_refused_to_others(self):
        r = self.client.post("/api/enregistrement/emplacements/slot-vide", headers=self.as_("autre"))
        self.assertEqual(r.status_code, 403)

    # ── Nouvelle procédure ──

    def test_contributor_proposes_at_a_place(self):
        r = self.client.post("/api/enregistrement/nouvelle", headers=self.as_("redac"), json={
            "titre": "Transférer un livret", "taxonomy_id": "t-ouv", "campaign_id": "camp", "workflow_json": [{"id": "1"}]})
        self.assertEqual(r.json()["resultat"], "proposee", r.text)
        prop = self.db.rows("procedure_propositions")[0]
        self.assertEqual(prop["campaign_id"], "camp")
        self.assertEqual(prop["metadata"]["cible"]["chemin"], "Épargne › Livrets › Ouverture")

        listed = self.client.get("/api/propositions", headers=self.as_("pilote")).json()["propositions"][0]
        self.assertEqual(listed["cible"]["chemin"], "Épargne › Livrets › Ouverture")
        r = self.client.post(f"/api/propositions/{prop['id']}/traiter", headers=self.as_("pilote"),
                             json={"decision": "campagne", "campaign_id": "camp"})
        self.assertEqual(r.status_code, 200, r.text)
        pid = r.json()["procedure_id"]
        proc = next(w for w in self.db.rows("workflows") if w["id"] == pid)
        self.assertEqual(proc["taxonomy_id"], "t-ouv")
        self.assertNotIn("cible", proc["procedure_metadata_json"])
        slot = next(s for s in self.db.rows("campaign_procedures") if s.get("procedure_id") == pid)
        self.assertEqual(slot["taxonomy_id"], "t-ouv")

    def test_manager_creates_directly(self):
        r = self.client.post("/api/enregistrement/nouvelle", headers=self.as_("pilote"), json={
            "titre": "Transférer un livret", "taxonomy_id": "t-ouv", "campaign_id": "camp"})
        self.assertEqual(r.json()["resultat"], "creee", r.text)
        pid = r.json()["procedure_id"]
        self.assertTrue(any(s.get("procedure_id") == pid and s["campaign_id"] == "camp" for s in self.db.rows("campaign_procedures")))

    def test_closed_campaign_refuses_new(self):
        r = self.client.post("/api/enregistrement/nouvelle", headers=self.as_("redac"), json={
            "titre": "Transférer un livret", "campaign_id": "close", "workflow_json": [{"id": "1"}]})
        self.assertEqual(r.status_code, 409)

    def test_reader_cannot_propose(self):
        r = self.client.post("/api/enregistrement/nouvelle", headers=self.as_("lect"), json={
            "titre": "Transférer un livret", "workflow_json": [{"id": "1"}]})
        self.assertEqual(r.status_code, 403)


if __name__ == "__main__":
    unittest.main()
