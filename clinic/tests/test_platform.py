"""Console plateforme (prompt 3) : ouvrir un espace et le remettre à son admin."""
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from manager import access_control as ac, auth, usage_meter  # noqa: E402
from manager.auth import AuthUser  # noqa: E402
from tests.fake_db import FakeDB  # noqa: E402


class FakeAdminAuth:
    """auth.admin.generate_link simulé : crée le compte à l'invitation, refuse un doublon."""

    def __init__(self, existing=()):
        self.users = {e: f"user-{i}" for i, e in enumerate(existing)}
        self.calls = []

    def generate_link(self, params):
        self.calls.append(params["type"])
        email = params["email"]
        if params["type"] == "invite" and email in self.users:
            raise RuntimeError("A user with this email address has already been registered")
        uid = self.users.setdefault(email, f"user-{len(self.users) + 1}")
        return SimpleNamespace(user=SimpleNamespace(id=uid),
                               properties=SimpleNamespace(action_link=f"https://lien/{params['type']}/{uid}"))


def world():
    db = FakeDB({
        "organisations": [{"id": "org-a", "nom": "Banque A", "slug": "banque-a", "statut": "active",
                           "created_at": "2026-01-01"}],
        "organisation_members": [{"organisation_id": "org-a", "user_id": "adminA", "role": "admin", "statut": "active"}],
        "user_profiles": [{"id": "adminA", "email": "admin@a.com", "full_name": "Admin A"},
                          {"id": "libre", "email": "libre@x.com"}],
        "platform_admins": [{"user_id": "super"}],
        "audit_log": [], "ai_usage": [],
    }, unique={"organisations": [("slug",)], "organisation_members": [("user_id",)]})
    db.auth.admin = FakeAdminAuth(existing=["admin@a.com", "libre@x.com"])
    return db


class PlatformTest(unittest.TestCase):
    def setUp(self):
        self.db = world()
        ac.forget_profile()
        auth._cache.clear()
        for p in (mock.patch.dict(os.environ, {"ORGANISATIONS_ENABLED": "true", "AUTH_MODE": "enforce"}),
                  mock.patch("database.supabase_client.get_raw_supabase", return_value=self.db)):
            p.start()
            self.addCleanup(p.stop)
        self.client = TestClient(main.app)

    def as_(self, uid):
        user = AuthUser(id=uid, email=f"{uid}@x.com", email_confirmed=True)
        for p in (mock.patch.object(ac, "_verify", return_value=user), mock.patch("manager.auth._verify", return_value=user)):
            p.start()
            self.addCleanup(p.stop)
        return {"Authorization": "Bearer t"}

    def create(self, **kw):
        body = {"nom": "Crédit Mutuel Test", "admin_nom": "Nadia", "admin_email": "nadia@cmt.fr", **kw}
        return self.client.post("/api/plateforme/organisations", json=body, headers=self.as_("super"))

    def test_create_organisation_and_admin_link(self):
        r = self.create()
        self.assertEqual(r.status_code, 200, r.text)
        data = r.json()
        self.assertEqual(data["organisation"]["slug"], "credit-mutuel-test")
        self.assertTrue(data["lien"].startswith("https://lien/invite/"))
        member = next(m for m in self.db.rows("organisation_members") if m["user_id"] == data["admin_id"])
        self.assertEqual((member["role"], member["statut"]), ("admin", "active"))
        self.assertEqual(self.db.rows("audit_log")[-1]["action"], "organisation.creee")
        # le lien n'est enregistré nulle part
        self.assertNotIn("https://lien", repr(self.db.tables))

    def test_refuses_member_of_another_org(self):
        r = self.create(admin_email="admin@a.com")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(len(self.db.rows("organisations")), 1)  # rien de créé

    def test_existing_free_account_gets_recovery_link(self):
        r = self.create(admin_email="libre@x.com")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["compte_existant"])
        self.assertIn("/recovery/", r.json()["lien"])

    def test_duplicate_slug(self):
        self.assertEqual(self.create(nom="Banque A").status_code, 409)

    def test_member_cannot_use_console(self):
        r = self.client.get("/api/plateforme/organisations", headers=self.as_("adminA"))
        self.assertEqual(r.status_code, 403)

    def test_suspend_then_members_refused(self):
        h = self.as_("super")
        self.assertEqual(self.client.patch("/api/plateforme/organisations/org-a", json={"statut": "suspendue"}, headers=h).status_code, 200)
        ac.forget_profile()
        r = self.client.get("/api/orchestration/procedures", headers=self.as_("adminA"))
        self.assertEqual(r.status_code, 403)
        self.assertIn("suspendu", r.json()["detail"])

    def test_platform_admin_sees_no_business_data(self):
        r = self.client.get("/api/orchestration/procedures", headers=self.as_("super"))
        self.assertEqual(r.status_code, 403)

    def test_regenerate_admin_link(self):
        r = self.client.post("/api/plateforme/organisations/org-a/lien", json={"admin_id": "adminA"}, headers=self.as_("super"))
        self.assertEqual(r.status_code, 200)
        self.assertIn("/recovery/", r.json()["lien"])
        r = self.client.post("/api/plateforme/organisations/org-a/lien", json={"admin_id": "libre"}, headers=self.as_("super"))
        self.assertEqual(r.status_code, 404)

    def test_list_with_usage(self):
        from database.org_scope import org_scope
        with org_scope("org-a"):
            usage_meter.record("Chat generate", 1000, 200)
        usage_meter.flush()
        r = self.client.get("/api/plateforme/organisations", headers=self.as_("super")).json()
        org = r["organisations"][0]
        self.assertEqual(org["admins"][0]["email"], "admin@a.com")
        self.assertEqual(org["consommation_mois"]["jetons_entree"], 1000)

    def test_onboarding_steps(self):
        r = self.client.get("/api/organisation/demarrage", headers=self.as_("adminA")).json()
        self.assertEqual(r["etapes"], {"taxonomie": False, "comptes": False, "campagne": False})


if __name__ == "__main__":
    unittest.main()
