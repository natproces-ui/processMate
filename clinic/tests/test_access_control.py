"""Contrôle d'accès central (manager/access_control.py) : règles, middleware, administration."""
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

ALICE = AuthUser(id="u-alice", email="alice@example.com", email_confirmed=True)


def profile(role="contributor", status="active", pid="u-alice"):
    return {"id": pid, "email": "alice@example.com", "global_role": role, "status": status}


class RulesTest(unittest.TestCase):
    def level(self, method, path):
        return ac.rule_for(method, path).level

    def test_classification(self):
        self.assertEqual(self.level("GET", "/health"), ac.PUBLIC)
        self.assertEqual(self.level("POST", "/api/studio/turn"), ac.GUEST)
        self.assertEqual(self.level("POST", "/api/stt/dictate"), ac.GUEST)
        self.assertEqual(self.level("POST", "/api/stt/transcribe"), ac.USER)
        self.assertEqual(self.level("GET", "/api/conversations"), ac.USER)
        self.assertEqual(self.level("POST", "/api/projects/abc/sources"), ac.USER)
        self.assertEqual(self.level("POST", "/api/img-to-bpmn/analyze"), ac.USER)
        self.assertEqual(self.level("GET", "/api/orchestration/procedures"), ac.MEMBER)
        self.assertEqual(self.level("GET", "/api/route-inconnue"), ac.MEMBER)  # sécurisé par défaut
        # « /api/bpmn » ne doit pas capturer « /api/bpmnx »
        self.assertEqual(self.level("GET", "/api/bpmnx/a"), ac.MEMBER)

    def test_roles_on_admin_and_campaign_routes(self):
        self.assertEqual(ac.rule_for("PATCH", "/api/orchestration/users/x").roles, frozenset({"admin"}))
        self.assertIsNone(ac.rule_for("GET", "/api/orchestration/users").roles)
        self.assertEqual(ac.rule_for("POST", "/api/campaigns").roles, ac.MANAGERS)
        self.assertEqual(ac.rule_for("POST", "/api/campaigns/c1/launch").roles, ac.MANAGERS)
        self.assertIsNone(ac.rule_for("PATCH", "/api/campaigns/c1/procedures/p1").roles)


class DecideTest(unittest.TestCase):
    def decide(self, method, path, user=ALICE, prof=None):
        return ac.decide(method, path, user, lambda u: prof)

    def test_guest_and_login(self):
        self.assertIsNone(self.decide("POST", "/api/studio/turn", user=None))
        self.assertEqual(self.decide("GET", "/api/conversations", user=None)[0], 401)
        self.assertIsNone(self.decide("GET", "/api/conversations", prof=None))

    def test_self_registered_account_is_not_member(self):
        self.assertEqual(self.decide("GET", "/api/orchestration/procedures", prof=None)[0], 403)
        self.assertEqual(self.decide("GET", "/api/orchestration/procedures", prof=profile(status="invited"))[0], 403)
        self.assertIsNone(self.decide("GET", "/api/orchestration/procedures", prof=profile()))

    def test_viewer_is_read_only(self):
        self.assertIsNone(self.decide("GET", "/api/campaigns", prof=profile("viewer")))
        self.assertEqual(self.decide("PATCH", "/api/orchestration/procedures/p1", prof=profile("viewer"))[0], 403)
        # l'espace personnel reste utilisable
        self.assertIsNone(self.decide("POST", "/api/conversations", prof=profile("viewer")))

    def test_campaign_steering_roles(self):
        self.assertEqual(self.decide("POST", "/api/campaigns", prof=profile("contributor"))[0], 403)
        self.assertIsNone(self.decide("POST", "/api/campaigns", prof=profile("process_owner")))
        self.assertIsNone(self.decide("PATCH", "/api/campaigns/c1/procedures/p1", prof=profile("contributor")))

    def test_describe(self):
        d = ac.describe(ALICE, profile("admin"))
        self.assertTrue(d["member"] and d["is_admin"] and d["can_manage_campaigns"])
        d = ac.describe(ALICE, profile("admin", status="suspended"))
        self.assertFalse(d["member"] or d["is_admin"])


class ProfileLookupTest(unittest.TestCase):
    def test_email_fallback_only_when_confirmed(self):
        db = FakeDB({"user_profiles": [{"id": "pre-cree", "email": "Alice@example.com",
                                        "global_role": "admin", "status": "active"}]})
        with mock.patch("database.supabase_client.get_supabase", return_value=db):
            self.assertEqual(ac._load_profile(ALICE)["id"], "pre-cree")
            unconfirmed = AuthUser(id="u-x", email="alice@example.com", email_confirmed=False)
            self.assertIsNone(ac._load_profile(unconfirmed))

    def test_legacy_roles_mapped_to_organisation_vocabulary(self):
        self.assertEqual(ac.normalize({"global_role": "process_owner", "status": "active"})["role"], "pilote")
        self.assertEqual(ac.normalize({"global_role": "validator", "status": "active"})["role"], "contributeur")
        self.assertEqual(ac.normalize({"global_role": "viewer", "status": "invited"})["status"], "invited")


class MiddlewareTest(unittest.TestCase):
    def setUp(self):
        auth._cache.clear()
        ac.forget_profile()
        self.client = TestClient(main.app)

    def test_enforce_rejects_without_token_with_cors_headers(self):
        with mock.patch.dict(os.environ, {"AUTH_MODE": "enforce"}):
            r = self.client.get("/api/orchestration/procedures", headers={"Origin": "http://localhost:3000"})
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.headers.get("access-control-allow-origin"), "http://localhost:3000")

    def test_enforce_rejects_non_member(self):
        with mock.patch.dict(os.environ, {"AUTH_MODE": "enforce"}), \
                mock.patch.object(ac, "_verify", return_value=ALICE), \
                mock.patch.object(ac, "_load_profile", return_value=None):
            r = self.client.get("/api/campaigns", headers={"Authorization": "Bearer t"})
        self.assertEqual(r.status_code, 403)
        self.assertIn("administrateur", r.json()["detail"])

    def test_enforce_invalid_token(self):
        with mock.patch.dict(os.environ, {"AUTH_MODE": "enforce"}), mock.patch.object(ac, "_verify", return_value=None):
            r = self.client.get("/api/conversations", headers={"Authorization": "Bearer faux"})
        self.assertEqual(r.status_code, 401)

    def test_report_mode_logs_but_lets_through(self):
        with mock.patch.dict(os.environ, {"AUTH_MODE": "report"}), self.assertLogs("manager.access_control", "WARNING") as logs:
            r = self.client.get("/api/route-inconnue")
        self.assertEqual(r.status_code, 404)
        self.assertIn("serait refusé", logs.output[0])

    def test_guest_chat_still_open_in_enforce(self):
        with mock.patch.dict(os.environ, {"AUTH_MODE": "enforce"}):
            r = self.client.post("/api/studio/generate", json={"session_id": "inconnue", "procedure_ids": ["p1"]})
        self.assertEqual(r.status_code, 404)  # atteint le routeur (session inconnue), pas refusé

    def test_preflight_passes(self):
        with mock.patch.dict(os.environ, {"AUTH_MODE": "enforce"}):
            r = self.client.options("/api/campaigns", headers={
                "Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"})
        self.assertEqual(r.status_code, 200)


class UserAdministrationTest(unittest.TestCase):
    """PATCH /api/orchestration/users/{id} : admin exigé même quand AUTH_MODE=off."""

    def setUp(self):
        auth._cache.clear()
        ac.forget_profile()
        self.client = TestClient(main.app)

    def patch(self, user_id, body, prof, admins=None):
        updates = []

        class Q:
            def select(self, *_): return self
            def eq(self, *_): return self
            def update(self, data):
                updates.append(data)
                return self
            def execute(self):
                return SimpleNamespace(data=admins or [])

        db = SimpleNamespace(table=lambda _: Q())
        with mock.patch.dict(os.environ, {"AUTH_MODE": "off"}), \
                mock.patch.object(ac, "_verify", return_value=ALICE), \
                mock.patch.object(ac, "_load_profile", return_value=prof), \
                mock.patch("routers.orchestration_router.get_supabase", return_value=db):
            r = self.client.patch(f"/api/orchestration/users/{user_id}", json=body,
                                  headers={"Authorization": "Bearer t"})
        return r, updates

    def test_requires_admin(self):
        r, updates = self.patch("u-bob", {"global_role": "admin"}, profile("contributor"))
        self.assertEqual(r.status_code, 403)
        self.assertEqual(updates, [])

    def test_no_token(self):
        with mock.patch.dict(os.environ, {"AUTH_MODE": "off"}):
            r = self.client.patch("/api/orchestration/users/u-bob", json={"global_role": "admin"})
        self.assertEqual(r.status_code, 401)

    def test_admin_cannot_change_own_role(self):
        r, _ = self.patch("u-alice", {"global_role": "viewer"}, profile("admin"))
        self.assertEqual(r.status_code, 400)

    def test_last_admin_kept(self):
        r, updates = self.patch("u-bob", {"status": "suspended"}, profile("admin"), admins=[{"id": "u-bob"}])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(updates, [])

    def test_admin_activates_account(self):
        r, updates = self.patch("u-bob", {"status": "active", "global_role": "contributor"}, profile("admin"),
                                admins=[{"id": "u-alice"}])
        self.assertEqual(r.status_code, 200)
        self.assertEqual(updates, [{"global_role": "contributor", "status": "active"}])


if __name__ == "__main__":
    unittest.main()
