from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database.procedure_metadata import normalize_procedure_metadata


class NormalizeProcedureMetadataTests(unittest.TestCase):
    def test_keeps_every_key(self):
        meta = {"objet": "o", "dateEffet": "2026-01-15", "annexe": [{"titre": "A"}], "champ_futur": 1}
        self.assertEqual({k: v for k, v in normalize_procedure_metadata(meta).items() if k in meta}, meta)

    def test_perimeter_aliases_are_synchronised(self):
        self.assertEqual(normalize_procedure_metadata({"perimeter": "Agences"})["perimetre"], "Agences")
        self.assertEqual(normalize_procedure_metadata({"perimetre": "Siège"})["perimeter"], "Siège")

    def test_no_alias_added_when_absent(self):
        self.assertNotIn("perimetre", normalize_procedure_metadata({"objet": "o"}))

    def test_none_and_input_untouched(self):
        self.assertEqual(normalize_procedure_metadata(None), {})
        meta = {"perimeter": "x"}
        normalize_procedure_metadata(meta)
        self.assertEqual(meta, {"perimeter": "x"})


if __name__ == "__main__":
    unittest.main()
