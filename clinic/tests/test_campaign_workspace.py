"""Projet de travail d'une campagne (manager/project_store.py) avec une base en mémoire."""
import sys
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from manager import project_store as store  # noqa: E402


class FakeQuery:
    def __init__(self, db, table):
        self.db, self.table, self.filters, self.row, self.n = db, table, [], None, None

    def select(self, *_):
        return self

    def eq(self, k, v):
        self.filters.append(lambda r: r.get(k) == v)
        return self

    def in_(self, k, values):
        self.filters.append(lambda r: r.get(k) in values)
        return self

    def is_(self, k, _null):
        self.filters.append(lambda r: r.get(k) is None)
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, n):
        self.n = n
        return self

    def insert(self, row):
        self.row = row
        return self

    def execute(self):
        rows = self.db.setdefault(self.table, [])
        if self.row is not None:
            row = {"id": str(uuid.uuid4()), "archived_at": None, **self.row}
            if self.table == "projects" and row.get("campaign_id") and any(
                    r.get("campaign_id") == row["campaign_id"] for r in rows):
                raise RuntimeError("duplicate key projects_campaign_unique")
            rows.append(row)
            return SimpleNamespace(data=[row])
        out = [r for r in rows if all(f(r) for f in self.filters)]
        return SimpleNamespace(data=out[: self.n] if self.n else out)


CAMP = "11111111-1111-1111-1111-111111111111"


def base():
    return {
        "user_profiles": [
            {"id": "admin", "global_role": "admin", "status": "active"},
            {"id": "coord", "global_role": "contributor", "status": "active"},
            {"id": "redac", "global_role": "contributor", "status": "active"},
            {"id": "autre", "global_role": "contributor", "status": "active"},
            {"id": "lecteur", "global_role": "viewer", "status": "active"},
            {"id": "invite", "global_role": "viewer", "status": "invited"},
        ],
        "formalization_campaigns": [{"id": CAMP, "title": "Épargne", "description": "22 procédures",
                                     "end_date": "2026-12-31", "coordinator_id": "coord"}],
        "campaign_procedures": [{"id": "cp1", "campaign_id": CAMP, "procedure_id": "w1", "assigned_to": "redac"}],
        "projects": [],
        "project_members": [],
    }


class CampaignWorkspaceTest(unittest.TestCase):
    def setUp(self):
        self.db = base()
        fake = SimpleNamespace(table=lambda t: FakeQuery(self.db, t))
        patcher = mock.patch.object(store, "_db", return_value=fake)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_created_once_with_instructions(self):
        p1 = store.for_campaign(CAMP, "coord")
        p2 = store.for_campaign(CAMP, "redac")
        self.assertEqual(p1["id"], p2["id"])
        self.assertEqual(len(self.db["projects"]), 1)
        self.assertIn("Épargne", p1["name"])
        self.assertIn("22 procédures", p1["instructions"])

    def test_roles_derived_from_campaign(self):
        pid = store.for_campaign(CAMP, "admin")["id"]
        self.assertEqual(store.get_accessible(pid, "admin")["my_role"], "owner")
        self.assertEqual(store.get_accessible(pid, "coord")["my_role"], "editor")
        self.assertEqual(store.get_accessible(pid, "redac")["my_role"], "editor")
        self.assertEqual(store.get_accessible(pid, "autre")["my_role"], "viewer")
        self.assertIsNone(store.get_accessible(pid, "autre", write=True))
        self.assertEqual(store.get_accessible(pid, "lecteur")["my_role"], "viewer")
        self.assertIsNone(store.get_accessible(pid, "invite"))
        self.assertIsNone(store.get_accessible(pid, "inconnu"))

    def test_non_member_cannot_open_workspace(self):
        self.assertIsNone(store.for_campaign(CAMP, "invite"))
        self.assertEqual(self.db["projects"], [])

    def test_listed_for_coordinator_and_assignee_only(self):
        store.for_campaign(CAMP, "admin")
        self.assertEqual(len(store.list_for("coord")), 1)
        self.assertEqual(len(store.list_for("redac")), 1)
        self.assertEqual(store.list_for("autre"), [])
        self.assertEqual(store.list_for("invite"), [])

    def test_personal_project_cannot_claim_a_campaign(self):
        p = store.create("invite", "Mon projet")
        self.assertNotIn("campaign_id", p)

    def test_unknown_campaign(self):
        self.assertIsNone(store.for_campaign("22222222-2222-2222-2222-222222222222", "admin"))


if __name__ == "__main__":
    unittest.main()
