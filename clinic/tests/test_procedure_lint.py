from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from processor.procedure_lint import lint_procedure


def row(i, typ="Task", outs=(), acteur="Agent", outil="CRM", condition=""):
    return {"id": str(i), "typeBpmn": typ, "acteur": acteur, "outil": outil, "condition": condition,
            "outputs": [{"targetId": str(o), "label": ""} for o in outs]}


GOOD = [row(1, "StartEvent", [2]), row(2, outs=[3]), row(3, "ExclusiveGateway", [4, 2], condition="OK ?"), row(4, "EndEvent")]
META = {"objet": "o", "perimetre": "p", "dateEffet": "d", "proprietaire": "x"}


class LintTests(unittest.TestCase):
    def messages(self, wf, meta=META):
        return [f["message"] for f in lint_procedure(wf, meta)]

    def test_clean_procedure_has_no_finding(self):
        self.assertEqual(self.messages(GOOD), [])

    def test_start_after_a_task(self):
        wf = [row(1, outs=[2]), row(2, "StartEvent", [3]), row(3, "EndEvent")]
        self.assertTrue(any("Le début (étape 2) est précédé" in m for m in self.messages(wf)))

    def test_dead_end_dangling_and_single_exit_gateway(self):
        wf = [row(1, "StartEvent", [2]), row(2, outs=[9]), row(3, "ExclusiveGateway", [4], condition="?"), row(4, "EndEvent")]
        msgs = " | ".join(self.messages(wf))
        self.assertIn("inexistante (9)", msgs)
        self.assertIn("qu'une seule issue", msgs)
        self.assertIn("jamais atteinte", msgs)

    def test_missing_information(self):
        wf = [row(1, "StartEvent", [2]), row(2, outs=[3], acteur="", outil=""), row(3, "EndEvent")]
        msgs = " | ".join(self.messages(wf, {}))
        self.assertIn("pas d'acteur", msgs)
        self.assertIn("sans outil", msgs)
        self.assertIn("Métadonnées non renseignées", msgs)


if __name__ == "__main__":
    unittest.main()
