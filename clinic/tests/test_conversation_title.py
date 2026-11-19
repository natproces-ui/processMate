"""Titre de conversation : vrai titre donné par le modèle, jamais celui choisi par l'utilisateur."""
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from manager import conversation_title as ct  # noqa: E402

FIRST = "on veut formaliser un processu de cration de compte bancaire etudiant au maroc. cherche les sources possibles"


class TitleTest(unittest.TestCase):
    def conv(self, title):
        return {"id": "c1", "owner_id": "u1", "title": title}

    def run_ensure(self, title, generated="Ouverture de compte bancaire étudiant au Maroc", fail=False):
        msgs = [{"role": "user", "content": FIRST}]
        gen = mock.Mock(side_effect=RuntimeError("quota")) if fail else mock.Mock(return_value=generated)
        with mock.patch.object(ct.store, "messages", return_value=msgs), \
                mock.patch.object(ct.store, "update") as upd, mock.patch.object(ct, "generate", gen):
            out = ct.ensure_title(self.conv(title), "suite", [])
        return out, upd, gen

    def test_new_conversation_gets_real_title(self):
        out, upd, _ = self.run_ensure("Nouvelle conversation")
        self.assertEqual(out, "Ouverture de compte bancaire étudiant au Maroc")
        upd.assert_called_once_with("c1", "u1", title=out)

    def test_old_truncated_title_is_replaced(self):
        out, _, _ = self.run_ensure(ct.store.title_from(FIRST, []))
        self.assertEqual(out, "Ouverture de compte bancaire étudiant au Maroc")

    def test_user_title_is_kept(self):
        out, upd, gen = self.run_ensure("Mon titre à moi")
        self.assertIsNone(out)
        gen.assert_not_called()
        upd.assert_not_called()

    def test_model_failure_falls_back(self):
        out, _, _ = self.run_ensure("Nouvelle conversation", fail=True)
        self.assertEqual(out, ct.store.title_from(FIRST, []))

    def test_clean(self):
        self.assertEqual(ct.clean("Titre : « Compte étudiant au Maroc ».\nautre"), "Compte étudiant au Maroc")
        self.assertLessEqual(len(ct.clean("mot " * 40)), 70)


if __name__ == "__main__":
    unittest.main()
