"""Accueil de l'organisation adapté au rôle : mes tâches, mes procédures, pilotage."""
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


def world():
    def task(tid, who, due, status="todo", kind="formalization", pid="w1"):
        return {"id": tid, "organisation_id": A, "procedure_id": pid, "title": f"Tâche {tid}", "assigned_to": who,
                "due_date": due, "status": status, "task_type": kind}
    return FakeDB({
        "organisations": [{"id": A, "nom": "A", "statut": "active"}],
        "organisation_members": [{"organisation_id": A, "user_id": u, "role": r, "statut": "active"}
                                 for u, r in {"pilote": "pilote", "redac": "contributeur", "lect": "lecteur"}.items()],
        "user_profiles": [{"id": u, "email": f"{u}@x.com"} for u in ("pilote", "redac", "lect")],
        "workflows": [{"id": "w1", "organisation_id": A, "title": "Ouvrir un livret", "procedure_metadata_json": {"nom": "Ouvrir un livret"}, "workflow_json": [{"id": "1"}]},
                      {"id": "w2", "organisation_id": A, "title": "Clôturer un livret", "procedure_metadata_json": {}, "workflow_json": []}],
        "procedure_assignments": [{"organisation_id": A, "procedure_id": "w1", "user_id": "redac", "raci_role": "R"},
                                  {"organisation_id": A, "procedure_id": "w2", "user_id": "redac", "raci_role": "A"},
                                  {"organisation_id": A, "procedure_id": "w2", "user_id": "redac", "raci_role": "C"}],
        "procedure_tasks": [task("t1", "redac", "2026-12-31"), task("t2", "redac", "2026-01-01"),
                            task("t3", "redac", None, status="done"), task("t4", "pilote", "2026-01-01", kind="validation")],
        "procedure_propositions": [{"id": "p1", "organisation_id": A, "statut": "en_attente"}, {"id": "p2", "organisation_id": A, "statut": "acceptee"}],
        "formalization_campaigns": [{"id": "c1", "organisation_id": A, "title": "Épargne", "status": "active", "end_date": "2026-01-31"},
                                    {"id": "c2", "organisation_id": A, "title": "Close", "status": "completed"}],
        "campaign_procedures": [{"id": "s1", "organisation_id": A, "campaign_id": "c1", "procedure_id": "w1", "status": "validated"},
                                {"id": "s2", "organisation_id": A, "campaign_id": "c1", "procedure_id": "w2", "status": "pending"}],
        "process_taxonomy": [],
    })


class HomeTest(unittest.TestCase):
    def setUp(self):
        self.db = world()
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

    def get(self, uid):
        self._user = AuthUser(id=uid, email=f"{uid}@x.com", email_confirmed=True)
        r = self.client.get("/api/accueil", headers={"Authorization": "Bearer t"})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def test_contributor(self):
        h = self.get("redac")
        self.assertEqual((h["taches"]["ouvertes"], h["taches"]["en_retard"]), (2, 1))
        self.assertEqual(h["taches"]["prochaines"][0]["id"], "t2")  # le retard d'abord
        self.assertEqual(h["taches"]["prochaines"][0]["procedure"], "Ouvrir un livret")
        self.assertEqual({p["id"]: p["role"] for p in h["procedures"]["liste"]}, {"w1": "R", "w2": "A"})
        self.assertNotIn("pilotage", h)

    def test_manager(self):
        p = self.get("pilote")["pilotage"]
        self.assertEqual((p["propositions"], p["validations"], p["taches_en_retard"]), (1, 1, 2))
        self.assertEqual([c["titre"] for c in p["campagnes"]], ["Épargne"])
        self.assertEqual((p["campagnes"][0]["avancement"], p["campagnes"][0]["en_retard"]), (50, True))
        self.assertEqual(p["referentiel"]["procedures"], 2)

    def test_reader_has_no_steering(self):
        self.assertNotIn("pilotage", self.get("lect"))


if __name__ == "__main__":
    unittest.main()
