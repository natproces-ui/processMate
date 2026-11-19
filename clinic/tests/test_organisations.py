"""Organisations (prompt 1) : appartenance, organisation suspendue, super-admin, membres."""
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

A, B = "org-a", "org-b"


def users():
    return {n: AuthUser(id=n, email=f"{n}@ex.com", email_confirmed=True)
            for n in ("adminA", "adminA2", "piloteA", "lecteurA", "inviteA", "adminB", "libre", "superadmin")}


def base():
    return FakeDB({
        "organisations": [{"id": A, "nom": "Banque A", "slug": "a", "statut": "active"},
                          {"id": B, "nom": "Banque B", "slug": "b", "statut": "suspendue"}],
        "organisation_members": [
            {"organisation_id": A, "user_id": "adminA", "role": "admin", "statut": "active"},
            {"organisation_id": A, "user_id": "piloteA", "role": "pilote", "statut": "active"},
            {"organisation_id": A, "user_id": "lecteurA", "role": "lecteur", "statut": "active"},
            {"organisation_id": A, "user_id": "inviteA", "role": "contributeur", "statut": "invitee"},
            {"organisation_id": B, "user_id": "adminB", "role": "admin", "statut": "active"},
        ],
        "user_profiles": [{"id": n, "email": f"{n}@ex.com", "full_name": n.capitalize()} for n in users()],
        "platform_admins": [{"user_id": "superadmin"}],
        "audit_log": [],
    })


class OrgModeTest(unittest.TestCase):
    def setUp(self):
        self.db = base()
        self.u = users()
        ac.forget_profile()
        auth._cache.clear()
        patches = [mock.patch.dict(os.environ, {"ORGANISATIONS_ENABLED": "true", "AUTH_MODE": "enforce"}),
                   mock.patch("database.supabase_client.get_supabase", return_value=self.db)]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.client = TestClient(main.app)

    def as_(self, name):
        user = self.u[name]
        p = mock.patch.object(ac, "_verify", return_value=user)
        p.start()
        self.addCleanup(p.stop)
        auth_p = mock.patch("manager.auth._verify", return_value=user)
        auth_p.start()
        self.addCleanup(auth_p.stop)
        return {"Authorization": "Bearer t"}

    # ── appartenance ──
    def test_membership_loaded(self):
        m = ac.profile_for(self.u["piloteA"])
        self.assertEqual((m["role"], m["status"], m["organisation_id"], m["organisation_nom"]),
                         ("pilote", "active", A, "Banque A"))
        self.assertIsNone(ac.profile_for(self.u["libre"]))

    def test_decisions(self):
        def d(name, method="GET", path="/api/orchestration/procedures"):
            return ac.decide(method, path, self.u[name], ac.profile_for)
        self.assertIsNone(d("piloteA"))
        self.assertEqual(d("inviteA")[0], 403)
        self.assertIn("suspendu", d("adminB")[1])
        self.assertEqual(d("libre")[0], 403)
        self.assertEqual(d("lecteurA", "PATCH", "/api/orchestration/procedures/x")[0], 403)
        self.assertIsNone(d("piloteA", "POST", "/api/campaigns"))
        self.assertEqual(d("superadmin")[0], 403)  # pas membre : pas de données clients
        self.assertIsNone(d("superadmin", "GET", "/api/plateforme/organisations"))
        self.assertEqual(d("adminA", "GET", "/api/plateforme/organisations")[0], 403)

    # ── /api/me ──
    def test_me(self):
        r = self.client.get("/api/me", headers=self.as_("piloteA")).json()
        self.assertEqual(r["organisation"]["nom"], "Banque A")
        self.assertTrue(r["can_manage_campaigns"])
        self.assertFalse(r["is_org_admin"])
        self.assertFalse(r["is_platform_admin"])

    def test_me_suspended_org(self):
        r = self.client.get("/api/me", headers=self.as_("adminB")).json()
        self.assertEqual(r["status"], "organisation_suspendue")
        self.assertFalse(r["member"])

    def test_me_platform_admin(self):
        r = self.client.get("/api/me", headers=self.as_("superadmin")).json()
        self.assertTrue(r["is_platform_admin"])
        self.assertFalse(r["member"])

    # ── membres ──
    def test_members_list_is_own_org_only(self):
        r = self.client.get("/api/organisation/members", headers=self.as_("lecteurA"))
        ids = {m["id"] for m in r.json()["members"]}
        self.assertEqual(ids, {"adminA", "piloteA", "lecteurA", "inviteA"})

    def test_admin_activates_member_and_audits(self):
        r = self.client.patch("/api/organisation/members/inviteA", json={"statut": "active"}, headers=self.as_("adminA"))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.db.rows("audit_log")[-1]["action"], "membre.modifie")

    def test_non_admin_refused(self):
        r = self.client.patch("/api/organisation/members/inviteA", json={"statut": "active"}, headers=self.as_("piloteA"))
        self.assertEqual(r.status_code, 403)

    def test_other_org_member_is_not_found(self):
        r = self.client.patch("/api/organisation/members/adminB", json={"statut": "suspendue"}, headers=self.as_("adminA"))
        self.assertEqual(r.status_code, 404)
        self.assertEqual(next(m for m in self.db.rows("organisation_members") if m["user_id"] == "adminB")["statut"], "active")

    def test_self_and_last_admin_protected(self):
        h = self.as_("adminA")
        self.assertEqual(self.client.patch("/api/organisation/members/adminA", json={"role": "lecteur"}, headers=h).status_code, 400)
        # adminA est le seul admin actif de A : promouvoir puis rétrograder le second est possible, pas le dernier
        self.client.patch("/api/organisation/members/piloteA", json={"role": "admin"}, headers=h)
        self.assertEqual(self.client.patch("/api/organisation/members/piloteA", json={"role": "pilote"}, headers=h).status_code, 200)

    def test_last_admin_cannot_be_suspended(self):
        self.db.rows("organisation_members").append(
            {"organisation_id": A, "user_id": "adminA2", "role": "admin", "statut": "suspendue"})
        actor = ac.Access(user=self.u["adminA2"], profile={"organisation_id": A, "user_id": "adminA2",
                                                           "role": "admin", "statut": "active"})
        from routers import organisation_router as orgr
        with self.assertRaises(Exception) as ctx:
            orgr.update_member(A, actor, "adminA", None, "suspendue")
        self.assertIn("au moins un administrateur", str(ctx.exception.detail))

    def test_legacy_role_route_refused_in_org_mode(self):
        r = self.client.patch("/api/orchestration/users/inviteA", json={"global_role": "admin"}, headers=self.as_("adminA"))
        self.assertEqual(r.status_code, 400)


class LegacyModeTest(unittest.TestCase):
    def test_org_routes_hidden(self):
        with mock.patch.dict(os.environ, {"ORGANISATIONS_ENABLED": "false", "AUTH_MODE": "off"}), \
                mock.patch.object(ac, "_verify", return_value=AuthUser(id="x")), \
                mock.patch.object(ac, "_load_profile", return_value={"id": "x", "global_role": "admin", "status": "active"}):
            ac.forget_profile()
            r = TestClient(main.app).get("/api/organisation/members", headers={"Authorization": "Bearer t"})
        self.assertEqual(r.status_code, 404)

    def test_current_org_is_none(self):
        with mock.patch.dict(os.environ, {"ORGANISATIONS_ENABLED": "false"}):
            self.assertIsNone(ac.current_org(None))


if __name__ == "__main__":
    unittest.main()


class ReportModeInOrgModeTest(unittest.TestCase):
    def test_member_routes_refused_cleanly_even_in_report_mode(self):
        db = base()
        with mock.patch.dict(os.environ, {"ORGANISATIONS_ENABLED": "true", "AUTH_MODE": "report"}), \
                mock.patch("database.supabase_client.get_raw_supabase", return_value=db):
            ac.forget_profile()
            client = TestClient(main.app, raise_server_exceptions=False)
            self.assertEqual(client.get("/api/orchestration/stats").status_code, 401)
            with mock.patch.object(ac, "_verify", return_value=AuthUser(id="libre", email="l@x.com")):
                self.assertEqual(client.get("/api/orchestration/stats", headers={"Authorization": "Bearer t"}).status_code, 403)
            # les routes « compte » et invité restent en mode journal
            self.assertNotEqual(client.post("/api/studio/generate", json={"session_id": "x", "procedure_ids": ["p"]}).status_code, 401)
