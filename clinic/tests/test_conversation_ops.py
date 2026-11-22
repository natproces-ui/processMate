"""Le chat raisonne sur l'ensemble des procédures de la conversation : découper, fusionner, retirer."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from manager.turn_recorder import TurnRecorder  # noqa: E402
from processor.studio_planner import apply_guardrails  # noqa: E402
from prompts.studio_planner_prompt import build_planner_prompt  # noqa: E402

PROCS = [{"id": "p1", "title": "Organiser une formation en alternance", "sources": [{"file": "deck.pptx"}]},
         {"id": "p2", "title": "Organiser une formation du plan", "sources": [{"file": "deck.pptx"}]}]


class PlannerOpsTest(unittest.TestCase):
    def test_split_replaces_the_conversation_procedure(self):
        plan = apply_guardrails({"action": "generate", "procedures": PROCS, "targets": ["p1", "p2"], "remplace": [1, "1", 9, "x"]},
                                ["deck.pptx"], True, None, conversation_count=3)
        self.assertEqual((plan.action, plan.targets, plan.replaces), ("generate", ["p1", "p2"], [1]))

    def test_merge_replaces_several(self):
        plan = apply_guardrails({"action": "merge", "procedures": PROCS, "targets": ["p1", "p2"], "merged_title": "Organiser",
                                 "remplace": [1, 2]}, ["deck.pptx"], True, None, conversation_count=2)
        self.assertEqual(plan.replaces, [1, 2])

    def test_remove_needs_a_procedure(self):
        plan = apply_guardrails({"action": "remove", "remplace": [2]}, ["deck.pptx"], True, None, conversation_count=3)
        self.assertEqual((plan.action, plan.replaces), ("remove", [2]))
        plan = apply_guardrails({"action": "remove", "remplace": []}, ["deck.pptx"], True, None, conversation_count=3)
        self.assertEqual(plan.action, "answer")
        self.assertTrue(plan.reply)

    def test_edit_never_replaces(self):
        plan = apply_guardrails({"action": "edit", "remplace": [1]}, ["deck.pptx"], True, None, conversation_count=2)
        self.assertEqual(plan.replaces, [])

    def test_prompt_lists_the_conversation_procedures(self):
        prompt = build_planner_prompt("Coupe la 1 en deux", ["deck.pptx"], True, [], None, False,
                                      [{"n": 1, "titre": "Organiser la formation", "etapes": 31}])
        ctx = json.loads(prompt.split("CONTEXTE :\n", 1)[1])
        self.assertEqual(ctx["procedures_de_la_conversation"][0]["titre"], "Organiser la formation")
        self.assertIn('"base"', prompt)


class FromExistingTest(unittest.TestCase):
    def test_procedure_based_on_the_conversation_needs_no_file(self):
        plan = apply_guardrails({"action": "generate", "remplace": [1], "targets": ["p1", "p2"], "procedures": [
            {"id": "p1", "title": "Organiser — Alternance", "base": [1, 7]},
            {"id": "p2", "title": "Organiser — Plan", "base": [1]},
            {"id": "p3", "title": "Sans rien", "base": []}]}, [], True, None, conversation_count=2)
        self.assertEqual([(p["title"], p["base"]) for p in plan.procedures],
                         [("Organiser — Alternance", [1]), ("Organiser — Plan", [1])])  # 7 n'existe pas ; « Sans rien » écartée
        self.assertEqual((plan.action, plan.replaces), ("generate", [1]))

    def test_moving_steps_between_two_procedures_is_not_an_edit(self):
        plan = apply_guardrails({"action": "edit", "procedures": [
            {"id": "p1", "title": "Former", "base": [1]}, {"id": "p2", "title": "Vérifier", "base": [2]}]},
            ["deck.pptx"], True, None, conversation_count=2)
        self.assertEqual((plan.action, plan.targets, plan.replaces), ("generate", ["p1", "p2"], [1, 2]))

    def test_edit_naming_two_procedures_redoes_both(self):
        plan = apply_guardrails({"action": "edit", "reply": "J'ai déplacé l'étape."}, [], True, None, 3,
                                ["Former", "Vérifier", "Payer"],
                                "Le contrôle des émargements doit se faire dans Vérifier, pas dans Former")
        self.assertEqual((plan.action, plan.replaces), ("generate", [1, 2]))
        self.assertEqual([(p["title"], p["base"]) for p in plan.procedures], [("Former", [1, 2]), ("Vérifier", [1, 2])])
        # une seule procédure nommée : la modification reste une modification
        # titres longs : le premier mot suffit quand il ne désigne qu'une procédure
        plan = apply_guardrails({"action": "edit"}, [], True, None, 3,
                                ["Organiser la formation", "Former les intérimaires", "Vérifier la fin de formation"],
                                "Le contrôle des émargements doit se faire dans Vérifier, pas dans Former")
        self.assertEqual((plan.action, plan.replaces), ("generate", [2, 3]))
        plan = apply_guardrails({"action": "edit"}, [], True, None, 3, ["Former", "Vérifier", "Payer"],
                                "Dans Former, l'étape 3 est faite par la RH")
        self.assertEqual(plan.action, "edit")

    def test_unchanged_procedures_are_not_redone(self):
        titles = ["Organiser la formation", "Former les intérimaires", "Vérifier la fin de formation"]
        plan = apply_guardrails({"action": "generate", "remplace": [1, 2, 3], "procedures": [
            {"id": "p1", "title": "Organiser la formation en alternance", "base": [1]},
            {"id": "p2", "title": "Organiser la formation du plan", "base": [1]},
            {"id": "p3", "title": "Former les intérimaires", "base": [2]},
            {"id": "p4", "title": "Vérifier la fin de formation", "base": [3]}]},
            [], True, None, 3, titles, "Alternance et Plan sont deux process à part : coupe Organiser en deux.")
        self.assertEqual((plan.targets, plan.replaces), (["p1", "p2"], [1]))
        # la même modification sur chaque procédure : toutes sont refaites
        plan = apply_guardrails({"action": "generate", "remplace": [2, 3], "procedures": [
            {"id": "p1", "title": "Former les intérimaires", "base": [2]},
            {"id": "p2", "title": "Vérifier la fin de formation", "base": [3]}]},
            [], True, None, 3, titles, "Ajoute une étape d'évaluation à la fin de chaque procédure")
        self.assertEqual(len(plan.targets), 2)

    def test_new_procedure_from_text_goes_to_the_chat(self):
        plan = apply_guardrails({"action": "generate", "procedures": [{"id": "p1", "title": "Recycler", "base": []}],
                                 "targets": ["p1"]}, [], True, None, conversation_count=2)
        self.assertEqual(plan.action, "edit")  # pas de fichier ni d'existant : le chat rédige à partir du texte

    def test_existing_procedure_is_given_as_source_with_corrections(self):
        from routers.studio_router import _base_note, _existing_as_source
        proc = {"key": "k1", "title": "Organiser la formation",
                "workflow": [{"id": "1", "étape": "Exprimer le besoin", "typeBpmn": "UserTask", "acteur": "Service RH",
                              "outil": "ServiceNow", "outputs": [{"targetId": "2"}]}],
                "enrichments": {"1": {"descriptif": "Le manager saisit | la demande"}}}
        src = _existing_as_source(proc)
        self.assertEqual((src["type"], src["filename"]), ("texte", "Procédure existante — Organiser la formation.txt"))
        self.assertIn("| 1 | Exprimer le besoin | UserTask |  | Service RH | ServiceNow |  | 2 | Le manager saisit / la demande |",
                      src["office"]["text"])
        note = _base_note({"title": "Organiser — Plan", "base": [1], "description": "le circuit Plan"}, {1: src})
        self.assertIn("MATIÈRE PRINCIPALE", note)
        self.assertIn("la procédure existante l'emporte", note)


class RecordedArchiveTest(unittest.TestCase):
    def test_archive_is_kept_in_the_turn(self):
        r = TurnRecorder()
        r.feed({"type": "procedures_archived", "keys": ["k1"], "titles": ["Organiser la formation"],
                "by": ["Organiser une formation en alternance", "Organiser une formation du plan"]})
        r.feed({"type": "done"})
        archived = r.finish()["payload"]["archived"][0]
        self.assertEqual((archived["keys"], len(archived["by"])), (["k1"], 2))


if __name__ == "__main__":
    unittest.main()
