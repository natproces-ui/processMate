"""Cloisonnement par organisation (prompt 2) : filet sur le code + étanchéité des routes."""
import ast
import os
import re
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from database import org_scope  # noqa: E402
from manager import access_control as ac, auth  # noqa: E402
from manager.auth import AuthUser  # noqa: E402
from tests.fake_db import FakeDB  # noqa: E402

A, B = "org-a", "org-b"
CODE_DIRS = ("routers", "manager", "processor", "database", "prompts")


def _python_files():
    for d in CODE_DIRS:
        yield from (ROOT / d).rglob("*.py")
    yield ROOT / "main.py"


class SafetyNetTest(unittest.TestCase):
    """Le filet : une table nouvelle ou un accès brut ne passent pas inaperçus."""

    def test_every_table_is_classified(self):
        known = org_scope.ORG_TABLES | org_scope.COMMON_TABLES | org_scope.PERSONAL_TABLES
        used = set()
        for f in _python_files():
            for node in ast.walk(ast.parse(f.read_text(encoding="utf-8"))):
                if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                        and node.func.attr in ("table", "from_") and node.args
                        and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str)):
                    used.add((node.args[0].value, f.relative_to(ROOT).as_posix()))
        unknown = sorted((t, f) for t, f in used if t not in known and t != "processmate-files")
        self.assertEqual(unknown, [], "Classer ces tables dans database/org_scope.py")

    def test_raw_client_only_where_allowed(self):
        allowed = {"database/supabase_client.py", "database/org_scope.py", "routers/platform_router.py",
                   "database/populate_users.py"}  # script hors application, table commune
        offenders = []
        for f in _python_files():
            rel = f.relative_to(ROOT).as_posix()
            text = f.read_text(encoding="utf-8")
            if rel not in allowed and (re.search(r"get_raw_supabase|create_client\(|\.raw\b\.", text)):
                offenders.append(rel)
        self.assertEqual(offenders, [], "Accès non cloisonné à la base")

    def test_sql_migration_lists_same_tables(self):
        sql = (ROOT / "database" / "organisations_cloisonnement.sql").read_text(encoding="utf-8")
        block = sql[sql.index("org_tables text[]"):sql.index("];")]
        self.assertEqual(set(re.findall(r"'([a-z_]+)'", block)), set(org_scope.ORG_TABLES))


class ScopedClientTest(unittest.TestCase):
    def setUp(self):
        self.raw = FakeDB({"workflows": [{"id": "w1", "organisation_id": A}, {"id": "w2", "organisation_id": B}]})
        self.db = org_scope.ScopedClient(self.raw)
        p = mock.patch.dict(os.environ, {"ORGANISATIONS_ENABLED": "true"})
        p.start()
        self.addCleanup(p.stop)

    def test_filters_and_stamps(self):
        with org_scope.org_scope(A):
            self.assertEqual([r["id"] for r in self.db.table("workflows").select("*").execute().data], ["w1"])
            self.db.table("workflows").update({"title": "x"}).eq("id", "w2").execute()
            self.db.table("workflows").delete().eq("id", "w2").execute()
            self.db.table("workflows").insert({"id": "w3"}).execute()
        rows = {r["id"]: r for r in self.raw.rows("workflows")}
        self.assertNotIn("title", rows["w2"])  # B intact
        self.assertEqual(rows["w3"]["organisation_id"], A)

    def test_refusals(self):
        with self.assertRaises(org_scope.OrgScopeError):
            self.db.table("workflows").select("*")  # aucune organisation
        with org_scope.org_scope(A):
            with self.assertRaises(org_scope.OrgScopeError):
                self.db.table("workflows").insert({"id": "x", "organisation_id": B})
            with self.assertRaises(org_scope.OrgScopeError):
                self.db.table("workflows").upsert({"id": "w2", "title": "volé"})
            with self.assertRaises(org_scope.OrgScopeError):
                self.db.table("workflows").update({"organisation_id": B})
            with self.assertRaises(org_scope.OrgScopeError):
                self.db.rpc("procedure_link_edges", {})

    def test_inactive_without_flag(self):
        with mock.patch.dict(os.environ, {"ORGANISATIONS_ENABLED": "false"}):
            self.assertEqual(len(self.db.table("workflows").select("*").execute().data), 2)


def wf(id_, org, nom):
    meta = {"nom": nom, "status": "Brouillon", "lifecycle_stages": []}
    return {"id": id_, "organisation_id": org, "session_id": "s-" + id_, "version": 1, "title": nom,
            "procedure_metadata_json": meta, "workflow_json": [], "enrichments_json": {},
            "created_at": "2026-11-01T00:00:00+00:00", "taxonomy_id": None}


def world():
    return FakeDB({
        "organisations": [{"id": A, "nom": "A", "statut": "active"}, {"id": B, "nom": "B", "statut": "active"}],
        "organisation_members": [
            {"organisation_id": A, "user_id": "alice", "role": "admin", "statut": "active"},
            {"organisation_id": B, "user_id": "bob", "role": "admin", "statut": "active"},
        ],
        "user_profiles": [{"id": "alice", "email": "alice@a.com", "full_name": "Alice"},
                          {"id": "bob", "email": "bob@b.com", "full_name": "Bob"}],
        "workflows": [wf("wa", A, "Procédure A"), wf("wb", B, "Procédure B secrète")],
        "sessions": [{"id": "s-wa", "organisation_id": A}, {"id": "s-wb", "organisation_id": B}],
        "formalization_campaigns": [
            {"id": "ca", "organisation_id": A, "title": "Campagne A", "status": "draft"},
            {"id": "cb", "organisation_id": B, "title": "Campagne B secrète", "status": "draft"}],
        "campaign_procedures": [],
        "procedure_tasks": [
            {"id": "ta", "organisation_id": A, "procedure_id": "wa", "title": "Tâche A", "assigned_to": "alice", "status": "todo"},
            {"id": "tb", "organisation_id": B, "procedure_id": "wb", "title": "Tâche B secrète", "assigned_to": "bob", "status": "todo"}],
        "tools": [{"id": "outa", "organisation_id": A, "name": "Outil A"},
                  {"id": "outb", "organisation_id": B, "name": "Outil B secret"}],
        "audit_log": [],
    })


class IsolationTest(unittest.TestCase):
    """Un membre de A n'obtient jamais une donnée de B, et ne peut rien écrire dans B."""

    def setUp(self):
        self.db = world()
        ac.forget_profile()
        auth._cache.clear()
        alice = AuthUser(id="alice", email="alice@a.com", email_confirmed=True)
        for p in (mock.patch.dict(os.environ, {"ORGANISATIONS_ENABLED": "true", "AUTH_MODE": "enforce"}),
                  mock.patch("database.supabase_client.get_raw_supabase", return_value=self.db),
                  mock.patch.object(ac, "_verify", return_value=alice),
                  mock.patch("manager.auth._verify", return_value=alice)):
            p.start()
            self.addCleanup(p.stop)
        self.client = TestClient(main.app, raise_server_exceptions=False)
        self.h = {"Authorization": "Bearer t"}

    def text(self, method, path, **kw):
        r = self.client.request(method, path, headers=self.h, **kw)
        return r.status_code, r.text

    def assertNoLeak(self, method, path, **kw):
        status, body = self.text(method, path, **kw)
        self.assertNotIn("secr", body, f"{method} {path} → {status}")
        return status

    def test_reads(self):
        # A voit SES données (sinon le test ne prouverait rien) et jamais celles de B
        for path, mine in (("/api/orchestration/procedures", "Procédure A"), ("/api/campaigns", "Campagne A"),
                           ("/api/tools", "Outil A")):
            status, body = self.text("GET", path)
            self.assertEqual(status, 200, f"{path} : {body[:200]}")
            self.assertIn(mine, body)
            self.assertNotIn("secr", body)
        self.assertNoLeak("GET", "/api/orchestration/tasks/my?user_id=bob")
        status = self.assertNoLeak("GET", "/api/orchestration/users")
        self.assertEqual(status, 200)
        self.assertNotIn("bob@b.com", self.text("GET", "/api/orchestration/users")[1])

    def test_reads_by_id_are_not_found(self):
        for path in ("/api/campaigns/cb", "/api/orchestration/tasks/tb", "/api/organisation/members"):
            self.assertNoLeak("GET", path)
        self.assertEqual(self.text("GET", "/api/campaigns/cb")[0], 404)
        self.assertEqual(self.text("GET", "/api/orchestration/tasks/tb")[0], 404)

    def test_writes_do_not_reach_b(self):
        before = {t: [dict(r) for r in self.db.rows(t)] for t in ("workflows", "formalization_campaigns", "procedure_tasks")}
        self.text("DELETE", "/api/campaigns/cb")
        self.text("PATCH", "/api/campaigns/cb", json={"title": "piraté"})
        self.text("DELETE", "/api/orchestration/procedures/wb")
        self.text("PATCH", "/api/orchestration/tasks/tb", json={"title": "piraté"})
        for t, rows in before.items():
            mine_b = [r for r in self.db.rows(t) if r.get("organisation_id") == B]
            self.assertEqual(mine_b, [r for r in rows if r.get("organisation_id") == B], t)

    def test_new_rows_belong_to_caller_org(self):
        status, _ = self.text("POST", "/api/campaigns", json={"title": "Nouvelle"})
        self.assertEqual(status, 200)
        created = [r for r in self.db.rows("formalization_campaigns") if r["title"] == "Nouvelle"]
        self.assertEqual(created[0]["organisation_id"], A)

    def test_non_member_gets_403_not_data(self):
        libre = AuthUser(id="libre", email="l@x.com", email_confirmed=True)
        with mock.patch.object(ac, "_verify", return_value=libre), mock.patch("manager.auth._verify", return_value=libre):
            ac.forget_profile()
            status, body = self.text("GET", "/api/orchestration/procedures")
        self.assertEqual(status, 403)
        self.assertNotIn("Procédure", body)


if __name__ == "__main__":
    unittest.main()
