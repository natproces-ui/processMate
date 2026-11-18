"""Authentification facultative (manager/auth.py). Nécessite fastapi (environnement du backend)."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import HTTPException  # noqa: E402

from manager import auth  # noqa: E402


def fake_supabase(user):
    def get_user(token):
        if user is None:
            raise RuntimeError("invalid JWT")
        return SimpleNamespace(user=user)
    return SimpleNamespace(auth=SimpleNamespace(get_user=get_user))


class AuthTest(unittest.TestCase):
    def setUp(self):
        auth._cache.clear()

    def test_no_token_is_guest(self):
        self.assertIsNone(auth.get_optional_user(""))

    def test_valid_token(self):
        u = SimpleNamespace(id="u1", email="a@b.c")
        with mock.patch("database.supabase_client.get_supabase", return_value=fake_supabase(u)):
            user = auth.get_optional_user("Bearer tok")
        self.assertEqual(user.id, "u1")

    def test_invalid_token_is_401_not_guest(self):
        with mock.patch("database.supabase_client.get_supabase", return_value=fake_supabase(None)):
            with self.assertRaises(HTTPException) as ctx:
                auth.get_optional_user("Bearer bad")
        self.assertEqual(ctx.exception.status_code, 401)

    def test_require_user(self):
        with self.assertRaises(HTTPException) as ctx:
            auth.require_user("")
        self.assertEqual(ctx.exception.status_code, 401)

    def test_cache_avoids_second_call(self):
        u = SimpleNamespace(id="u1", email=None)
        sb = fake_supabase(u)
        with mock.patch("database.supabase_client.get_supabase", return_value=sb) as gs:
            auth.get_optional_user("Bearer tok")
            auth.get_optional_user("Bearer tok")
        self.assertEqual(gs.call_count, 1)


if __name__ == "__main__":
    unittest.main()
