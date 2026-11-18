"""Tâches produites par le processus, points ouverts, relances, couverture BIAN (prompt 7)."""
import os
import sys
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from database.org_scope import org_scope  # noqa: E402
from manager import access_control as ac, auth, inbox  # noqa: E402
from manager.auth import AuthUser  # noqa: E402
from tests.fake_db import FakeDB  # noqa: E402

A, B = "org-a", "org-b"
PEOPLE = {"pilote": "pilote", "redac": "contributeur", "metier": "contributeur", "autre": "contributeur"}


def world():
    points = [{"id": "p1", "question": "Qui signe le bordereau ?", "statut": "ouvert"},
              {"id": "p2", "question": "Délai de conservation ?", "statut": "ouvert"}]
    return FakeDB({
        "organisations": [{"id": A, "nom": "A", "statut": "active", "parametres": {}}, {"id": B, "nom": "B", "statut": "active"}],
        "organisation_members": [{"organisation_id": A, "user_id": u, "role": r, "statut": "active"} for u, r in PEOPLE.items()]
        + [{"organisation_id": B, "user_id": "bob", "role": "admin", "statut": "active"}],
        "user_profiles": [{"id": u, "email": f"{u}@a.com", "full_name": u.capitalize()} for u in list(PEOPLE) + ["bob"]],
        "workflows": [
            {"id": "w1", "organisation_id": A, "title": "Virement", "workflow_json": [{"étape": "Saisir le virement"}],
             "procedure_metadata_json": {"nom": "Virement", "open_points": points}},
            {"id": "w2", "organisation_id": A, "title": "Prêt", "workflow_json": [],
             "procedure_metadata_json": {"nom": "Prêt", "validation": {"nom": "Pilote", "le": "2026-11-01"}}},
            {"id": "wb", "organisation_id": B, "title": "B", "workflow_json": [], "procedure_metadata_json": {}}],
        "procedure_assignments": [{"organisation_id": A, "procedure_id": "w1", "user_id": "redac", "raci_role": "R"}],
        "equipes": [{"id": "eq", "organisation_id": A, "nom": "Conformité", "responsable_id": "metier"}],
        "equipe_membres": [], "procedure_tasks": [], "procedure_notifications": [],
        "formalization_campaigns": [{"id": "camp", "organisation_id": A, "title": "C", "status": "active", "coordinator_id": "pilote"}],
        "campaign_procedures": [],
        "bian_scenarios": [
            {"id": "s1", "version": "14", "title": "Paiement", "category": "Payments", "participants": ["Payment Order", "Customer Agreement"]},
            {"id": "s2", "version": "14", "title": "Crédit", "category": "Lending", "participants": ["Consumer Loan"]},
            {"id": "s0", "version": "13", "title": "Ancien", "category": "Old", "participants": ["Obsolete Domain"]}],
        "procedure_bian": [{"id": "mb", "organisation_id": B, "procedure_id": "wb", "domaine": "Consumer Loan", "statut": "accepte"}],
        "notification_preferences": [], "audit_log": [],
    })


class InboxBianTest(unittest.TestCase):
    def setUp(self):
        self.db = world()
        ac.forget_profile()
        auth._cache.clear()
        for p in (mock.patch.dict(os.environ, {"ORGANISATIONS_ENABLED": "true", "AUTH_MODE": "enforce", "CAMPAIGN_SLOTS_ENABLED": "true"}),
                  mock.patch("database.supabase_client.get_raw_supabase", return_value=self.db),
                  mock.patch.object(inbox, "email_task")):
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

    def tasks(self, **kw):
        return [t for t in self.db.rows("procedure_tasks") if all(t.get(k) == v for k, v in kw.items())]

    # ── points ouverts ──
    def test_point_addressed_answered_back_into_procedure(self):
        r = self.client.post("/api/points/w1/p1/adresser", json={"user_id": "metier"}, headers=self.as_("redac"))
        self.assertEqual(r.status_code, 200, r.text)
        task = self.tasks(assigned_to="metier")[0]
        self.assertEqual((task["task_type"], task["metadata"]["open_point_id"]), ("consultation", "p1"))
        inbox.email_task.assert_called()
        self.assertEqual(self.client.post("/api/points/w1/p1/repondre", json={"reponse": "x"}, headers=self.as_("autre")).status_code, 403)
        r = self.client.post("/api/points/w1/p1/repondre", json={"reponse": "Le directeur d'agence"}, headers=self.as_("metier"))
        self.assertEqual(r.status_code, 200, r.text)
        point = self.db.rows("workflows")[0]["procedure_metadata_json"]["open_points"][0]
        self.assertEqual((point["statut"], point["reponse"], point["repondu_par_nom"]), ("repondu", "Le directeur d'agence", "Metier"))
        self.assertEqual(self.tasks(assigned_to="metier")[0]["status"], "completed")

    def test_point_addressed_to_team_goes_to_lead(self):
        self.client.post("/api/points/w1/p2/adresser", json={"equipe_id": "eq"}, headers=self.as_("redac"))
        self.assertEqual([t["assigned_to"] for t in self.tasks(task_type="consultation")], ["metier"])

    def test_cannot_address_outside_org(self):
        r = self.client.post("/api/points/w1/p1/adresser", json={"user_id": "bob"}, headers=self.as_("redac"))
        self.assertEqual(r.status_code, 400)

    def test_pilot_sees_open_point_count_not_content(self):
        self.db.rows("campaign_procedures").append({"id": "slot", "organisation_id": A, "campaign_id": "camp", "procedure_id": "w1",
                                                    "procedure_nom": "Virement", "status": "in_progress", "raci": None})
        r = self.client.get("/api/campaigns/camp/emplacements", headers=self.as_("pilote")).json()
        self.assertEqual(r["emplacements"][0]["points_ouverts"], 2)

    # ── relances, clôture, compteur ──
    def test_reminder_sent_once(self):
        self.db.rows("procedure_tasks").extend([
            {"id": "t1", "organisation_id": A, "procedure_id": "w1", "assigned_to": "redac", "status": "todo", "title": "Formaliser",
             "due_date": "2026-11-20", "metadata": {}},
            {"id": "t2", "organisation_id": A, "procedure_id": "w1", "assigned_to": "redac", "status": "todo", "title": "Plus tard",
             "due_date": "2027-03-01", "metadata": {}}])
        with org_scope(A):
            self.assertEqual(inbox.remind(date(2026, 11, 18)), 1)
            self.assertEqual(inbox.remind(date(2026, 11, 18)), 0)  # une seule fois
        self.assertIn("relance_le", self.tasks(id="t1")[0]["metadata"])

    def test_counter_and_cancel_on_close(self):
        self.db.rows("procedure_tasks").extend([
            {"id": "t1", "organisation_id": A, "procedure_id": "w1", "assigned_to": "redac", "status": "todo", "title": "F",
             "due_date": "2020-01-01", "metadata": {"campaign_id": "camp"}},
            {"id": "t3", "organisation_id": A, "procedure_id": "w1", "assigned_to": "redac", "status": "todo", "title": "Hors campagne", "metadata": {}}])
        c = self.client.get("/api/taches/compteur", headers=self.as_("redac")).json()
        self.assertEqual((c["ouvertes"], c["en_retard"]), (2, 1))
        self.assertEqual(self.client.post("/api/campaigns/camp/close", headers=self.as_("pilote")).status_code, 200)
        self.assertEqual(self.tasks(id="t1")[0]["status"], "cancelled")
        self.assertEqual(self.tasks(id="t3")[0]["status"], "todo")

    def test_reminders_route_protected(self):
        self.assertEqual(self.client.post("/api/taches/relances").status_code, 401)
        with mock.patch.dict(os.environ, {"CRON_TOKEN": "secret"}):
            self.assertEqual(self.client.post("/api/taches/relances", headers={"X-Cron-Token": "faux"}).status_code, 401)
            self.assertEqual(self.client.post("/api/taches/relances", headers={"X-Cron-Token": "secret"}).status_code, 200)

    def test_email_preference(self):
        h = self.as_("redac")
        self.assertTrue(self.client.get("/api/me/notifications", headers=h).json()["email_taches"])
        self.client.put("/api/me/notifications", json={"email_taches": False}, headers=h)
        self.assertFalse(inbox.email_enabled("redac"))

    # ── BIAN ──
    def test_coverage_states_and_isolation(self):
        h = self.as_("redac")
        self.assertEqual(self.client.post("/api/bian/procedures/w1", json={"domaine": "Inconnu"}, headers=h).status_code, 400)
        self.client.post("/api/bian/procedures/w2", json={"domaine": "Consumer Loan"}, headers=h)
        self.client.post("/api/bian/procedures/w1", json={"domaine": "Payment Order"}, headers=h)
        cov = {d["domaine"]: d["etat"] for d in self.client.get("/api/bian/couverture", headers=h).json()["domaines"]}
        self.assertEqual(cov, {"Consumer Loan": "couvert", "Payment Order": "en_cours", "Customer Agreement": "non_couvert"})
        self.assertEqual(self.db.rows("procedure_bian")[-1]["organisation_id"], A)

    def test_assistant_suggestions_must_be_accepted(self):
        fake = SimpleNamespace(text='["Payment Order", "Domaine inventé"]')
        with mock.patch("manager.model_manager.generate_content", return_value=fake):
            r = self.client.post("/api/bian/procedures/w1/suggestions", headers=self.as_("redac"))
        self.assertEqual(r.status_code, 200, r.text)
        sugg = r.json()["suggestions"]
        self.assertEqual([(s["domaine"], s["statut"]) for s in sugg], [("Payment Order", "suggere")])
        cov = {d["domaine"]: d["etat"] for d in self.client.get("/api/bian/couverture", headers=self.as_("redac")).json()["domaines"]}
        self.assertEqual(cov["Payment Order"], "non_couvert")  # pas appliquée seule
        self.client.post(f"/api/bian/correspondances/{sugg[0]['id']}/accepter", headers=self.as_("redac"))
        cov = {d["domaine"]: d["etat"] for d in self.client.get("/api/bian/couverture", headers=self.as_("redac")).json()["domaines"]}
        self.assertEqual(cov["Payment Order"], "en_cours")

    def test_slots_from_gaps(self):
        body = {"campaign_id": "camp", "domaines": ["Customer Agreement"]}
        self.assertEqual(self.client.post("/api/bian/couverture/emplacements", json=body, headers=self.as_("redac")).status_code, 403)
        r = self.client.post("/api/bian/couverture/emplacements", json=body, headers=self.as_("pilote"))
        self.assertEqual(r.status_code, 200, r.text)
        slot = self.db.rows("campaign_procedures")[0]
        self.assertEqual((slot["procedure_nom"], slot["origine"]), ("Customer Agreement", "bian"))


if __name__ == "__main__":
    unittest.main()


class MergeTest(unittest.TestCase):
    def test_answers_survive_editor_save(self):
        server = [{"id": "p1", "question": "Q", "statut": "repondu", "reponse": "R", "destinataires": ["m"]},
                  {"id": "p2", "question": "Q2", "statut": "ouvert", "destinataires": ["m"]}]
        incoming = [{"id": "p1", "question": "Q (reformulée)", "statut": "ouvert"}]
        merged = {p["id"]: p for p in inbox.merge_open_points(server, incoming)}
        self.assertEqual((merged["p1"]["question"], merged["p1"]["statut"], merged["p1"]["reponse"]), ("Q (reformulée)", "repondu", "R"))
        self.assertIn("p2", merged)  # adressé : jamais perdu
