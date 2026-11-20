"""Plusieurs procédures dans une conversation : le chat comprend de laquelle on parle."""
import asyncio
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from manager import turn_progress  # noqa: E402
from processor import intent_detector  # noqa: E402
from processor.intent_detector import IntentResult  # noqa: E402
from prompts.intent_prompt import get_intent_prompt  # noqa: E402

ETUDIANT = [{"id": "1", "étape": "Contrôle des pièces", "acteur": "Conseiller"}]
EPARGNE = [{"id": "1", "étape": "Ouverture du livret", "acteur": "Conseiller"},
           {"id": "2", "étape": "Premier versement", "acteur": "Client"}]
PROCS = [{"key": "k1", "title": "Compte étudiant", "workflow": ETUDIANT},
         {"key": "k2", "title": "Compte épargne", "workflow": EPARGNE}]


class PromptTest(unittest.TestCase):
    def test_section_only_with_several_procedures(self):
        procs = [{"n": 1, "title": "Compte étudiant", "steps": 1, "displayed": True},
                 {"n": 2, "title": "Compte épargne", "steps": 2, "displayed": False}]
        prompt = get_intent_prompt("ajoute un contrôle", True, [], None, procs)
        self.assertIn("1. Compte étudiant (1 étapes) [affichée]", prompt)
        self.assertIn("2. Compte épargne (2 étapes)", prompt)
        self.assertIn("target_procedure", prompt)
        self.assertNotIn("PROCÉDURES DE LA CONVERSATION", get_intent_prompt("x", True, [], None, procs[:1]))

    def test_longer_history_when_several_procedures(self):
        history = [{"role": "user", "content": f"message {i}"} for i in range(10)]
        procs = [{"n": 1, "title": "A", "steps": 1}, {"n": 2, "title": "B", "steps": 1}]
        self.assertIn("message 2", get_intent_prompt("x", True, [], history, procs))
        self.assertNotIn("message 2", get_intent_prompt("x", True, [], history, None))

    def test_target_number_is_validated(self):
        self.assertEqual(intent_detector._target(2, 2), 2)
        self.assertEqual(intent_detector._target("1", 2), 1)
        self.assertIsNone(intent_detector._target(3, 2))
        self.assertIsNone(intent_detector._target(None, 2))
        self.assertIsNone(intent_detector._target("deux", 2))


class ChatTargetTest(unittest.TestCase):
    def run_turn(self, intent: str, target):
        from processor.chat_processor import ChatProcessor
        proc = ChatProcessor.__new__(ChatProcessor)
        seen = {}

        async def fake_patch(message, workflow, enrichments):
            seen["workflow"] = workflow
            return {"success": True, "intent": "patch", "operations": [], "operations_count": 0}

        proc._handle_patch = fake_patch
        result = IntentResult(intent=intent, clarify_question=None, reference_files=[], source_files=[],
                              summary="", target_procedure=target)

        async def fake_detect(**kwargs):
            seen["procedures"] = kwargs.get("procedures")
            return result

        events = []

        async def go():
            queue: asyncio.Queue = asyncio.Queue()
            with turn_progress.progress_scope(queue), mock.patch("processor.chat_processor.detect_intent", fake_detect):
                await proc.process_message(message="ajoute un versement", files=[], history=[],
                                           current_workflow=ETUDIANT, procedures=PROCS, active_procedure="k1")
            await asyncio.sleep(0)  # les événements partent au tour de boucle suivant
            while not queue.empty():
                events.append(queue.get_nowait())

        asyncio.run(go())
        return seen, events

    def test_switches_to_the_procedure_the_message_is_about(self):
        seen, events = self.run_turn("patch", 2)
        self.assertEqual(seen["workflow"], EPARGNE)
        self.assertEqual(seen["procedures"][0]["displayed"], True)
        targets = [e for e in events if e.get("type") == "target_procedure"]
        self.assertEqual(targets, [{"type": "target_procedure", "key": "k2", "title": "Compte épargne"}])

    def test_stays_on_displayed_procedure(self):
        seen, events = self.run_turn("patch", 1)
        self.assertEqual(seen["workflow"], ETUDIANT)
        self.assertFalse([e for e in events if e.get("type") == "target_procedure"])

    def test_no_target_keeps_displayed_procedure(self):
        seen, events = self.run_turn("patch", None)
        self.assertEqual(seen["workflow"], ETUDIANT)
        self.assertFalse([e for e in events if e.get("type") == "target_procedure"])


if __name__ == "__main__":
    unittest.main()


class RecorderTargetTest(unittest.TestCase):
    def test_target_title_is_kept(self):
        from manager.turn_recorder import TurnRecorder
        r = TurnRecorder()
        r.feed({"type": "target_procedure", "key": "k2", "title": "Compte épargne"})
        r.feed({"type": "chat_result", "result": {"intent": "patch", "explanation": "Fait.", "operations_count": 1}})
        r.feed({"type": "done"})
        self.assertEqual(r.finish()["payload"]["targetTitle"], "Compte épargne")
