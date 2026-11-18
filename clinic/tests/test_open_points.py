"""Lecture des points ouverts renvoyés par le modèle (prompts/open_points_prompt.py)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from prompts.open_points_prompt import build_prompt, parse  # noqa: E402


class OpenPointsTest(unittest.TestCase):
    def test_parse_valid(self):
        text = '```json\n[{"step_id": "3", "question": "Qui valide le devis ?", "type": "acteur à confirmer", "acteur_a_interroger": "DCI", "origine": "source", "source": "Acteur à confirmer"}]\n```'
        pts = parse(text, ["1", "3"])
        self.assertEqual(len(pts), 1)
        p = pts[0]
        self.assertEqual((p["step_id"], p["origine"], p["statut"], p["acteur"]), ("3", "source", "ouvert", "DCI"))
        self.assertTrue(p["id"])

    def test_unknown_step_and_type_normalized(self):
        pts = parse('[{"step_id": "99", "question": "x ?", "type": "bizarre", "origine": "autre"}]', ["1"])
        self.assertIsNone(pts[0]["step_id"])
        self.assertEqual(pts[0]["type"], "autre")
        self.assertEqual(pts[0]["origine"], "detecte")

    def test_garbage_and_empty(self):
        self.assertEqual(parse("pas du json", []), [])
        self.assertEqual(parse("[]", []), [])
        self.assertEqual(parse('[{"question": ""}, "x"]', []), [])

    def test_cap(self):
        many = "[" + ",".join('{"question": "q%d ?"}' % i for i in range(30)) + "]"
        self.assertEqual(len(parse(many, [])), 15)

    def test_prompt_contains_steps_and_sources(self):
        prompt = build_prompt({"title": "T", "workflow": [{"id": "1", "étape": "Saisir"}]}, ["Acteur à confirmer"])
        self.assertIn("Saisir", prompt)
        self.assertIn("Acteur à confirmer", prompt)


if __name__ == "__main__":
    unittest.main()
