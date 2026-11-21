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
        self.assertIn("Découper", prompt)


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
