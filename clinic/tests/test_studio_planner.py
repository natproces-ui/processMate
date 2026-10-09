from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from processor.studio_planner import MAX_AUTO_GENERATE, apply_guardrails

FILES = ["manuel.pdf", "photo1.jpg"]


def proc(pid, title, file="manuel.pdf", pages="1-3"):
    return {"id": pid, "title": title, "sources": [{"file": file, "pages": pages}]}


class GuardrailTests(unittest.TestCase):
    def test_single_procedure_is_generated_directly(self):
        plan = apply_guardrails({"action": "propose", "procedures": [proc("p1", "A")]}, FILES, False)
        self.assertEqual((plan.action, plan.targets), ("generate", ["p1"]))

    def test_several_without_target_are_proposed(self):
        plan = apply_guardrails({"action": "generate", "procedures": [proc("p1", "A"), proc("p2", "B")]}, FILES, False)
        self.assertEqual(plan.action, "propose")

    def test_procedure_without_real_source_is_dropped(self):
        data = {"action": "propose", "procedures": [proc("p1", "A"), proc("p2", "Fantôme", file="inexistant.pdf")]}
        plan = apply_guardrails(data, FILES, False)
        self.assertEqual([p["title"] for p in plan.procedures], ["A"])
        self.assertEqual(plan.action, "generate")  # il n'en reste qu'une

    def test_too_many_targets_require_confirmation(self):
        procs = [proc(f"p{i}", f"P{i}") for i in range(1, MAX_AUTO_GENERATE + 3)]
        plan = apply_guardrails({"action": "generate", "procedures": procs, "targets": [p["id"] for p in procs]}, FILES, False)
        self.assertEqual(plan.action, "propose")

    def test_merge_defaults_to_all(self):
        plan = apply_guardrails({"action": "merge", "procedures": [proc("p1", "A"), proc("p2", "B")], "merged_title": "AB"}, FILES, False)
        self.assertEqual((plan.action, plan.targets, plan.merged_title), ("merge", ["p1", "p2"], "AB"))

    def test_follow_up_reuses_previous_proposal(self):
        previous = [proc("p1", "A"), proc("p2", "B")]
        plan = apply_guardrails({"action": "generate", "procedures": [], "targets": ["p2"]}, [], False, previous)
        self.assertEqual((plan.action, plan.targets), ("generate", ["p2"]))

    def test_edit_without_open_procedure_becomes_generation(self):
        plan = apply_guardrails({"action": "edit", "procedures": [proc("p1", "A")]}, FILES, False)
        self.assertEqual(plan.action, "generate")

    def test_reference_file_is_not_a_source(self):
        data = {"action": "generate", "references": ["photo1.jpg"],
                "procedures": [proc("p1", "A"), proc("p2", "Modèle", file="photo1.jpg")]}
        plan = apply_guardrails(data, FILES, False)
        self.assertEqual(plan.references, ["photo1.jpg"])
        self.assertEqual([p["title"] for p in plan.procedures], ["A"])  # le modèle n'est pas une procédure
        self.assertEqual((plan.action, plan.targets), ("generate", ["p1"]))

    def test_unknown_action_and_nothing_found_answers(self):
        plan = apply_guardrails({"action": "???", "procedures": []}, FILES, False)
        self.assertEqual(plan.action, "answer")


if __name__ == "__main__":
    unittest.main()
