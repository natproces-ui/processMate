"""Administration de l'organisation (prompt 4) : comptes, invitations, retrait, équipes."""
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
from tests.test_platform import FakeAdminAuth  # noqa: E402

A, B = "org-a", "org-b"


def world():
    db = FakeDB({
        "organisations": [{"id": A, "nom": "Banque A", "statut": "active"}, {"id": B, "nom": "Banque B", "statut": "active"}],
        "organisation_members": [
            {"organisation_id": A, "user_id": "adminA", "role": "admin", "statut": "active"},
            {"organisation_id": A, "user_id": "redac", "role": "contributeur", "statut": "active"},
            {"organisation_id": B, "user_id": "bob", "role": "admin", "statut": "active"},
        ],
        "user_profiles": [{"id": "adminA", "email": "admin@a.com"}, {"id": "redac", "email": "redac@a.com", "full_name": "Rédac"},
                          {"id": "bob", "email": "bob@b.com"}, {"id": "libre", "email": "libre@x.com"}],
        "procedure_tasks": [
            {"id": "t1", "organisation_id": A, "assigned_to": "redac", "status": "todo", "title": "Formaliser X"},
            {"id": "t2", "organisation_id": A, "assigned_to": "redac", "status": "validated", "title": "Ancienne"}],
        "process_taxonomy": [{"id": "br1", "organisation_id": A, "name": "Crédit"}, {"id": "brB", "organisation_id": B, "name": "B"}],
        "equipes": [], "equipe_membres": [], "equipe_branches": [], "organisation_invitations": [],
        "platform_admins": [], "audit_log": [],
    }, unique={"organisation_members": [("user_id",)], "equipes": [("organisation_id", "nom")],
               "equipe_branches": [("taxonomy_id",)]})
    db.auth.admin = FakeAdminAuth(existing=["admin@a.com", "redac@a.com", "bob@b.com", "libre@x.com"])
    return db


class OrgAdminTest(unittest.TestCase):
    def setUp(self):
        self.db = world()
        ac.forget_profile()
        auth._cache.clear()
        for p in (mock.patch.dict(os.environ, {"ORGANISATIONS_ENABLED": "true", "AUTH_MODE": "enforce"}),
                  mock.patch("database.supabase_client.get_raw_supabase", return_value=self.db)):
            p.start()
            self.addCleanup(p.stop)
        self.client = TestClient(main.app)

    def as_(self, uid, email=None, confirmed=True):
        user = AuthUser(id=uid, email=email or f"{uid}@x.com", email_confirmed=confirmed)
        for p in (mock.patch.object(ac, "_verify", return_value=user), mock.patch("manager.auth._verify", return_value=user)):
            p.start()
            self.addCleanup(p.stop)
        ac.forget_profile()
        return {"Authorization": "Bearer t"}

    def new(self, email, **kw):
        body = {"email": email, "full_name": "Nouvelle Personne", "role": "contributeur", **kw}
        return self.client.post("/api/organisation/members", json=body, headers=self.as_("adminA", "admin@a.com"))

    # ── comptes ──
    def test_new_account_gets_link(self):
        r = self.new("nouvelle@a.com", department="Crédit")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn("lien", r.json())
        uid = r.json()["id"]
        m = next(m for m in self.db.rows("organisation_members") if m["user_id"] == uid)
        self.assertEqual((m["organisation_id"], m["statut"]), (A, "active"))

    def test_other_org_and_same_org_refused(self):
        self.assertEqual(self.new("bob@b.com").status_code, 409)
        self.assertEqual(self.new("redac@a.com").status_code, 409)

    def test_free_account_is_invited_not_attached(self):
        r = self.new("libre@x.com")
        self.assertTrue(r.json()["invitation"])
        self.assertFalse(any(m["user_id"] == "libre" for m in self.db.rows("organisation_members")))
        # la personne voit l'invitation et l'accepte
        me = self.client.get("/api/me", headers=self.as_("libre", "libre@x.com")).json()
        self.assertEqual(me["invitations"][0]["organisation"], "Banque A")
        inv = me["invitations"][0]["id"]
        r = self.client.post(f"/api/invitations/{inv}/accepter", headers=self.as_("libre", "libre@x.com"))
        self.assertEqual(r.status_code, 200)
        m = next(m for m in self.db.rows("organisation_members") if m["user_id"] == "libre")
        self.assertEqual((m["organisation_id"], m["role"]), (A, "contributeur"))

    def test_unconfirmed_email_cannot_accept(self):
        self.new("libre@x.com")
        inv = self.db.rows("organisation_invitations")[0]["id"]
        r = self.client.post(f"/api/invitations/{inv}/accepter", headers=self.as_("libre", "libre@x.com", confirmed=False))
        self.assertEqual(r.status_code, 404)

    def test_refuse_invitation(self):
        self.new("libre@x.com")
        inv = self.db.rows("organisation_invitations")[0]["id"]
        self.client.post(f"/api/invitations/{inv}/refuser", headers=self.as_("libre", "libre@x.com"))
        self.assertEqual(self.db.rows("organisation_invitations")[0]["statut"], "refusee")
        self.assertFalse(any(m["user_id"] == "libre" for m in self.db.rows("organisation_members")))

    def test_non_admin_cannot_create(self):
        r = self.client.post("/api/organisation/members", json={"email": "x@a.com", "full_name": "X Y"},
                             headers=self.as_("redac", "redac@a.com"))
        self.assertEqual(r.status_code, 403)

    # ── retrait ──
    def test_remove_member_keeps_history_and_lists_open_tasks(self):
        r = self.client.delete("/api/organisation/members/redac", headers=self.as_("adminA", "admin@a.com"))
        self.assertEqual(r.status_code, 200)
        self.assertEqual([t["id"] for t in r.json()["taches_a_reaffecter"]], ["t1"])
        self.assertFalse(any(m["user_id"] == "redac" for m in self.db.rows("organisation_members")))
        self.assertTrue(any(p["id"] == "redac" for p in self.db.rows("user_profiles")))  # nom conservé
        self.assertEqual(len(self.db.rows("procedure_tasks")), 2)

    def test_cannot_remove_other_org_or_self(self):
        h = self.as_("adminA", "admin@a.com")
        self.assertEqual(self.client.delete("/api/organisation/members/bob", headers=h).status_code, 404)
        self.assertEqual(self.client.delete("/api/organisation/members/adminA", headers=h).status_code, 400)

    # ── équipes ──
    def test_team_lifecycle(self):
        h = self.as_("adminA", "admin@a.com")
        r = self.client.post("/api/organisation/equipes", json={"nom": "Back office crédit", "responsable_id": "redac",
                                                               "membres": ["redac", "adminA"], "branches": ["br1"]}, headers=h)
        self.assertEqual(r.status_code, 200, r.text)
        team = r.json()["equipe"]
        self.assertEqual((sorted(team["membres"]), team["branches"]), (["adminA", "redac"], ["br1"]))
        self.assertEqual(self.db.rows("equipes")[0]["organisation_id"], A)
        # un membre d'une autre organisation, ou une branche d'une autre organisation : refusés
        self.assertEqual(self.client.patch(f"/api/organisation/equipes/{team['id']}", json={"membres": ["bob"]}, headers=h).status_code, 400)
        self.assertEqual(self.client.patch(f"/api/organisation/equipes/{team['id']}", json={"branches": ["brB"]}, headers=h).status_code, 400)
        # nom en double
        self.assertEqual(self.client.post("/api/organisation/equipes", json={"nom": "Back office crédit"}, headers=h).status_code, 409)
        # une branche n'a qu'une équipe responsable
        r2 = self.client.post("/api/organisation/equipes", json={"nom": "Autre", "branches": ["br1"]}, headers=h).json()["equipe"]
        teams = {t["id"]: t for t in self.client.get("/api/organisation/equipes", headers=h).json()["equipes"]}
        self.assertEqual((teams[team["id"]]["branches"], teams[r2["id"]]["branches"]), ([], ["br1"]))
        self.assertEqual(self.client.delete(f"/api/organisation/equipes/{team['id']}", headers=h).status_code, 200)
        self.assertEqual([m for m in self.db.rows("equipe_membres") if m["equipe_id"] == team["id"]], [])


if __name__ == "__main__":
    unittest.main()
