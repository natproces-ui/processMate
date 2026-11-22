from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from processor.studio_planner import MAX_AUTO_GENERATE, apply_guardrails

FILES = ["manuel.pdf", "photo1.jpg"]


def proc(pid, title, file="manuel.pdf", pages="1-3"):
    return {"id": pid, "title": title, "sources": [{"file": file, "pages": pages}]}


class GuardrailTests(unittest.TestCase):
    def test_single_procedure_generated_when_asked(self):
        plan = apply_guardrails({"action": "generate", "procedures": [proc("p1", "A")]}, FILES, False)
        self.assertEqual((plan.action, plan.targets), ("generate", ["p1"]))

    def test_single_procedure_proposed_when_file_only_presented(self):
        # « voici notre support » : on propose, rien n'est généré d'office
        plan = apply_guardrails({"action": "propose", "procedures": [proc("p1", "A")]}, FILES, False)
        self.assertEqual(plan.action, "propose")

    def test_formalize_without_target_generates_all(self):
        # « extrais les procédures » : on fait ce qui est demandé, toutes, sans confirmation
        plan = apply_guardrails({"action": "generate", "procedures": [proc("p1", "A"), proc("p2", "B")]}, FILES, False)
        self.assertEqual((plan.action, plan.targets), ("generate", ["p1", "p2"]))

    def test_six_procedures_generated_without_confirmation(self):
        procs = [proc(f"p{i}", f"P{i}") for i in range(1, 7)]
        plan = apply_guardrails({"action": "generate", "procedures": procs, "targets": [p["id"] for p in procs]}, FILES, False)
        self.assertEqual((plan.action, len(plan.targets)), ("generate", 6))

    def test_transcription_of_a_joined_file(self):
        plan = apply_guardrails({"action": "transcribe", "reply": "Je recopie le logigramme tel quel."}, ["mcne.pdf"], False)
        self.assertEqual(plan.action, "transcribe")
        # sans fichier, le chat recopie le texte donné
        self.assertEqual(apply_guardrails({"action": "transcribe"}, [], False).action, "edit")

    def test_explicit_faithful_copy_is_a_transcription(self):
        plan = apply_guardrails({"action": "generate", "procedures": [{"id": "p1", "title": "MCNE", "sources": [{"file": "mcne.pdf"}]}]},
                                ["mcne.pdf"], False, message="Recopie ce logigramme tel quel, sans reformuler.")
        self.assertEqual(plan.action, "transcribe")
        plan = apply_guardrails({"action": "generate", "procedures": [{"id": "p1", "title": "MCNE", "sources": [{"file": "mcne.pdf"}]}]},
                                ["mcne.pdf"], False, message="Formalise ce logigramme.")
        self.assertEqual(plan.action, "generate")

    def test_targeted_question(self):
        plan = apply_guardrails({"action": "ask", "reply": "Ce fichier est un plan de risques : que voulez-vous en tirer ?"},
                                ["plan.xlsx"], False)
        self.assertEqual((plan.action, plan.procedures), ("ask", []))
        self.assertEqual(apply_guardrails({"action": "ask", "reply": ""}, ["plan.xlsx"], False).action, "answer")

    def test_chat_work_is_decided_once(self):
        # le chat exécute ce que l'aiguillage décide, sur la procédure désignée
        plan = apply_guardrails({"action": "edit", "cible": 2, "mode": "modifier"}, [], True, None, 3, ["A", "B", "C"])
        self.assertEqual((plan.action, plan.chat_intent, plan.target), ("edit", "patch", 2))
        plan = apply_guardrails({"action": "edit", "cible": 1, "mode": "refaire"}, ["v2.docx"], True, None, 1, ["A"])
        self.assertEqual(plan.chat_intent, "regen")
        self.assertEqual(apply_guardrails({"action": "explain", "cible": 9}, [], True, None, 1, ["A"]).target, None)
        self.assertEqual(apply_guardrails({"action": "search"}, [], False).chat_intent, "web_search")
        # rédiger depuis le seul texte : le chat rédige
        plan = apply_guardrails({"action": "generate", "procedures": []}, [], False)
        self.assertEqual((plan.action, plan.chat_intent), ("edit", "generate"))
        # une question avec seulement des fichiers : analyse des fichiers
        self.assertEqual(apply_guardrails({"action": "explain"}, ["fiche.docx"], False).action, "analyze")
        # une modification quand des procédures existent mais qu'aucune n'est affichée
        self.assertEqual(apply_guardrails({"action": "edit", "cible": 1}, [], False, None, 2, ["A", "B"]).chat_intent, "patch")

    def test_interfaces_of_a_procedure(self):
        plan = apply_guardrails({"action": "interfaces", "cible": 2}, [], True, None, 3, ["A", "B", "C"])
        self.assertEqual((plan.action, plan.target), ("interfaces", 2))
        # sans procédure : rien à lire
        self.assertEqual(apply_guardrails({"action": "interfaces"}, [], False).action, "answer")

    def test_interfaces_reply_lists_one_system_per_line(self):
        from routers.studio_router import _interfaces_text
        text = _interfaces_text("CREDOC", [
            {"application_cible": "TI+", "taches_liees": [{"id_tache": "2"}, {"id_tache": "4"}],
             "description_fonctionnelle": "Saisie et validation", "type_flux": "Inconnu", "niveau_confiance": "Confirmée"},
            {"application_cible": "Docflow", "taches_liees": [{"id_tache": "6"}], "description_fonctionnelle": "Rejet",
             "niveau_confiance": "Suggérée"}])
        self.assertIn("**2 systèmes**", text)
        self.assertIn("**TI+** (étapes 2, 4)", text)
        self.assertIn("à confirmer", text)
        self.assertNotIn("Remarque", text)
        self.assertIn("aucun système", _interfaces_text("X", []))

    def test_analyze_is_kept(self):
        plan = apply_guardrails({"action": "analyze", "procedures": []}, FILES, False)
        self.assertEqual(plan.action, "analyze")

    def test_procedure_without_real_source_is_dropped(self):
        data = {"action": "propose", "procedures": [proc("p1", "A"), proc("p2", "Fantôme", file="inexistant.pdf")]}
        plan = apply_guardrails(data, FILES, False)
        self.assertEqual([p["title"] for p in plan.procedures], ["A"])
        self.assertEqual(plan.action, "propose")  # il n'en reste qu'une : l'utilisateur confirme

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
