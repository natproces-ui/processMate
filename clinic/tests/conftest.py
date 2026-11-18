"""Garde-fous des tests : aucun appel à la vraie base Supabase, à Jira ni à l'e-mail.

Un test qui a besoin d'une base remplace get_supabase (ou _db) par tests/fake_db.FakeDB.
S'il l'oublie, le client réel lève une erreur au lieu de partir sur le réseau. Les
tickets Jira et les e-mails (configurés dans .env) sont remplacés par des erreurs.
"""
import pytest


@pytest.fixture(autouse=True)
def _no_real_services(monkeypatch):
    from database import supabase_client

    def refuse(*_a, **_k):
        raise RuntimeError("Test : appel à un service réel interdit (base, Jira, e-mail)")

    monkeypatch.setattr(supabase_client, "get_raw_supabase", refuse)
    monkeypatch.setattr(supabase_client, "_supabase_client", None)
    from manager import jira_client
    monkeypatch.setattr(jira_client, "create_issue", refuse)
    import email_sender
    monkeypatch.setattr(email_sender, "send_task_email", refuse)
    monkeypatch.setattr(email_sender, "send_tasks_digest_email", refuse)
    try:
        from routers import orchestration_tasks_router as otr
        monkeypatch.setattr(otr, "send_task_email", refuse)
        monkeypatch.setattr(otr, "send_tasks_digest_email", refuse)
    except Exception:
        pass
