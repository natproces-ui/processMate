"""Du chat à la campagne (prompt 6) : soumettre, relire, valider (nom + date), propositions."""
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
PEOPLE = {"pilote": "pilote", "redac": "contributeur", "relect": "contributeur", "valid": "contributeur", "autre": "contributeur"}


def world():
    meta = {"nom": "Ouvrir un livret", "status": "Brouillon", "lifecycle_stages": [
        {"id": f"s{i}", "title": t, "status": "pending"} for i, t in enumerate(
            ["Création", "Formalisation", "Vérification", "Validation", "Signature", "Publication"])]}
    return FakeDB({
        "organisations": [{"id": A, "nom": "Banque A", "statut": "active", "parametres": {}}],
        "organisation_members": [{"organisation_id": A, "user_id": u, "role": r, "statut": "active"} for u, r in PEOPLE.items()],
        "user_profiles": [{"id": u, "email": f"{u}@a.com", "full_name": u.capitalize()} for u in PEOPLE],
        "workflows": [{"id": "w1", "organisation_id": A, "session_id": "s1", "version": 1, "title": "Ouvrir un livret",
                       "procedure_metadata_json": meta, "workflow_json": [{"id": "1"}], "enrichments_json": {}}],
        "procedure_assignments": [
            {"organisation_id": A, "procedure_id": "w1", "user_id": "redac", "raci_role": "R"},
            {"organisation_id": A, "procedure_id": "w1", "user_id": "relect", "raci_role": "C"},
            {"organisation_id": A, "procedure_id": "w1", "user_id": "valid", "raci_role": "A"}],
        "procedure_tasks": [{"id": "t-r", "organisation_id": A, "procedure_id": "w1", "title": "Formaliser", "assigned_to": "redac",
                             "assigned_by": "pilote", "raci_role": "R", "task_type": "formalization", "status": "todo",
                             "created_at": "2026-11-01", "metadata": {}}],
        "formalization_campaigns": [{"id": "camp", "organisation_id": A, "title": "Épargne", "status": "active",
                                     "coordinator_id": "pilote", "end_date": "2026-12-31"}],
        "campaign_procedures": [{"id": "slot", "organisation_id": A, "campaign_id": "camp", "procedure_id": "w1",
                                 "procedure_nom": "Ouvrir un livret", "status": "pending"}],
        "sessions": [], "procedure_events": [], "procedure_task_events": [], "procedure_notifications": [],
        "procedure_propositions": [], "audit_log": [],
    })


class CircuitTest(unittest.TestCase):
    def setUp(self):
        self.db = world()
        ac.forget_profile()
        auth._cache.clear()
        for p in (mock.patch.dict(os.environ, {"ORGANISATIONS_ENABLED": "true", "AUTH_MODE": "enforce", "VERSIONS_ENABLED": "false"}),
                  mock.patch("database.supabase_client.get_raw_supabase", return_value=self.db)):
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

    def post(self, uid, path, **body):
        return self.client.post(f"/api/circuit/procedures/w1/{path}", json=body, headers=self.as_(uid))

    def tasks(self, **kw):
        return [t for t in self.db.rows("procedure_tasks") if all(t.get(k) == v for k, v in kw.items())]

    def slot(self):
        return self.db.rows("campaign_procedures")[0]["status"]

    def test_full_path_r_c_a(self):
        ctx = self.client.get("/api/circuit/procedures/w1", headers=self.as_("redac")).json()
        self.assertEqual((ctx["action"], ctx["campagne"]["title"], ctx["mes_roles"]), ("soumettre", "Épargne", ["R"]))

        r = self.post("redac", "soumettre", message="Prête")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.tasks(id="t-r")[0]["status"], "submitted")
        self.assertEqual(len(self.tasks(assigned_to="relect", task_type="review")), 1)
        self.assertEqual(self.slot(), "in_review")

        r = self.post("relect", "relecture", decision="transmettre")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(len(self.tasks(assigned_to="valid", task_type="validation")), 1)
        self.assertEqual(self.slot(), "submitted")

        self.assertEqual(self.post("autre", "validation", decision="valider").status_code, 403)

        r = self.post("valid", "validation", decision="valider", message="OK")
        self.assertEqual(r.status_code, 200, r.text)
        v = r.json()["validation"]
        self.assertEqual(v["nom"], "Valid")
        self.assertTrue(v["le"].startswith("20"))
        self.assertEqual(self.slot(), "validated")
        self.assertEqual(self.db.rows("audit_log")[-1]["action"], "procedure.validee")

    def test_review_sends_back_to_writer(self):
        self.post("redac", "soumettre")
        r = self.post("relect", "relecture", decision="renvoyer", message="Il manque le contrôle")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(len(self.tasks(assigned_to="redac", task_type="correction")), 1)
        self.assertEqual(self.slot(), "in_progress")

    def test_no_action_without_task(self):
        self.assertEqual(self.post("autre", "soumettre").status_code, 403)

    def test_self_validation_refused_by_default(self):
        # le valideur est aussi le rédacteur
        for a in self.db.rows("procedure_assignments"):
            if a["raci_role"] == "R":
                a["user_id"] = "valid"
        self.db.rows("procedure_assignments")[:] = [a for a in self.db.rows("procedure_assignments") if a["raci_role"] != "C"]
        self.tasks(id="t-r")[0]["assigned_to"] = "valid"
        self.assertEqual(self.post("valid", "soumettre").status_code, 200)
        r = self.post("valid", "validation", decision="valider")
        self.assertEqual(r.status_code, 403)
        self.db.rows("organisations")[0]["parametres"] = {"auto_validation": True}
        self.assertEqual(self.post("valid", "validation", decision="valider").status_code, 200)

    # ── la route générique de transition ne fait plus confiance au client ──
    def test_transition_actor_is_the_connected_account(self):
        r = self.client.post("/api/orchestration/tasks/t-r/transition", headers=self.as_("autre"),
                             json={"actor_id": "redac", "status": "submitted"})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.tasks(id="t-r")[0]["status"], "todo")

    def test_only_designated_validator_validates(self):
        self.post("redac", "soumettre")
        self.post("relect", "relecture", decision="transmettre")
        vt = self.tasks(task_type="validation")[0]
        r = self.client.post(f"/api/orchestration/tasks/{vt['id']}/transition", headers=self.as_("pilote"),
                             json={"actor_id": "valid", "status": "validated"})
        self.assertEqual(r.status_code, 403)

    # ── propositions ──
    def test_proposition_flow(self):
        r = self.client.post("/api/propositions", headers=self.as_("autre"),
                             json={"titre": "Clôturer un livret", "workflow_json": [{"id": "1", "étape": "Début"}]})
        self.assertEqual(r.status_code, 200, r.text)
        pid = r.json()["proposition"]["id"]
        self.assertEqual(self.client.post(f"/api/propositions/{pid}/traiter", headers=self.as_("autre"),
                                          json={"decision": "referentiel"}).status_code, 403)
        mine = self.client.get("/api/propositions", headers=self.as_("autre")).json()["propositions"]
        self.assertEqual(len(mine), 1)
        self.assertEqual(self.client.post(f"/api/propositions/{pid}/traiter", headers=self.as_("pilote"),
                                          json={"decision": "refuser"}).status_code, 400)  # motif exigé
        r = self.client.post(f"/api/propositions/{pid}/traiter", headers=self.as_("pilote"),
                             json={"decision": "campagne", "campaign_id": "camp"})
        self.assertEqual(r.status_code, 200, r.text)
        wf = next(w for w in self.db.rows("workflows") if w["id"] == r.json()["procedure_id"])
        self.assertEqual(wf["workflow_json"], [{"id": "1", "étape": "Début"}])
        self.assertEqual(len(self.tasks(procedure_id=wf["id"], task_type="validation", assigned_to="pilote")), 1)
        self.assertTrue(any(s["procedure_id"] == wf["id"] and s["origine"] == "proposition" for s in self.db.rows("campaign_procedures")))


if __name__ == "__main__":
    unittest.main()
