"""Garde-fou des tests : aucun appel à la vraie base Supabase.

Un test qui a besoin d'une base remplace get_supabase (ou _db) par tests/fake_db.FakeDB.
S'il l'oublie, le client réel lève une erreur au lieu de partir sur le réseau.
"""
import pytest


@pytest.fixture(autouse=True)
def _no_real_supabase(monkeypatch):
    from database import supabase_client

    def refuse():
        raise RuntimeError("Test : appel à la vraie base Supabase interdit (utilisez tests/fake_db.FakeDB)")

    monkeypatch.setattr(supabase_client, "get_raw_supabase", refuse)
    monkeypatch.setattr(supabase_client, "_supabase_client", None)
