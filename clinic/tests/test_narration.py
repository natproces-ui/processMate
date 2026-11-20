"""Suivi « ce que je fais » : résumés de réflexion du modèle, réécrits en français, dans l'ordre."""
import asyncio
import sys
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from google.genai import types  # noqa: E402

from manager import model_manager, turn_progress  # noqa: E402


class ThoughtConfigTest(unittest.TestCase):
    def test_only_during_a_live_turn(self):
        self.assertIsNone(model_manager._with_thoughts(None))

        async def go():
            with turn_progress.progress_scope(asyncio.Queue()):
                return model_manager._with_thoughts(types.GenerateContentConfig(temperature=0.1))

        cfg = asyncio.run(go())
        self.assertTrue(cfg.thinking_config.include_thoughts)
        self.assertEqual(cfg.temperature, 0.1)

    def test_explicit_thinking_setting_is_kept(self):
        async def go():
            with turn_progress.progress_scope(asyncio.Queue()):
                return model_manager._with_thoughts(
                    types.GenerateContentConfig(thinking_config=types.ThinkingConfig(thinking_budget=0)))

        self.assertIsNone(asyncio.run(go()))

    def test_thoughts_are_separated_from_the_answer(self):
        chunk = SimpleNamespace(candidates=[SimpleNamespace(content=SimpleNamespace(parts=[
            SimpleNamespace(text="**Grouping actors** I merge Agence and RH.", thought=True),
            SimpleNamespace(text='{"operations": []}', thought=None),
        ]))])
        self.assertEqual(model_manager._chunk_parts(chunk),
                         [("**Grouping actors** I merge Agence and RH.", True), ('{"operations": []}', False)])


class NarrationTest(unittest.TestCase):
    def test_lines_in_order_and_empty_ones_dropped(self):
        def fake_line(summary):
            if "slow" in summary:
                time.sleep(0.3)  # la première traduction est la plus lente : l'ordre doit tenir
            return "-" if "json" in summary else f"Je {summary}"

        async def go():
            queue: asyncio.Queue = asyncio.Queue()
            with mock.patch.object(turn_progress, "_french_line",
                                   side_effect=lambda s: "" if fake_line(s) == "-" else fake_line(s)), \
                    mock.patch.object(turn_progress, "MIN_INTERVAL", 0), \
                    turn_progress.progress_scope(queue) as sink:
                turn_progress.thought("regroupe les acteurs slow")
                turn_progress.thought("finalise le json")
                turn_progress.thought("fusionne les étapes 3 et 4")
                while turn_progress.pending(sink):
                    await asyncio.sleep(0.05)
            await asyncio.sleep(0.05)
            return [queue.get_nowait() for _ in range(queue.qsize())]

        events = asyncio.run(go())
        self.assertEqual([e["label"] for e in events],
                         ["Je regroupe les acteurs slow", "Je fusionne les étapes 3 et 4"])
        self.assertTrue(all(e["type"] == "status" and e["state"] == "done" for e in events))



class ElisionTest(unittest.TestCase):
    def test_lost_apostrophes_are_restored(self):
        reply = SimpleNamespace(text="J analyse le parcours d une entité et l agence, qu il faut garder ; de la DCI et le dossier")
        with mock.patch("manager.model_manager.generate_content", return_value=reply):
            self.assertEqual(turn_progress._french_line("x"),
                             "J'analyse le parcours d'une entité et l'agence, qu'il faut garder ; de la DCI et le dossier")

    def test_nothing_concrete_is_dropped(self):
        with mock.patch("manager.model_manager.generate_content", return_value=SimpleNamespace(text="-")):
            self.assertEqual(turn_progress._french_line("I am finalizing the JSON"), "")


class RecordedOrderTest(unittest.TestCase):
    def test_finished_action_comes_after_thoughts(self):
        from manager.turn_recorder import TurnRecorder
        r = TurnRecorder()
        r.feed({"type": "status", "id": "work", "label": "Réécriture de la procédure", "state": "running"})
        r.feed({"type": "status", "id": "pensee1", "label": "Je revois les acteurs.", "state": "done", "kind": "thought"})
        r.feed({"type": "status", "id": "work", "label": "Procédure rédigée · 14 étapes", "state": "done"})
        r.feed({"type": "done"})
        self.assertEqual([s["label"] for s in r.finish()["payload"]["steps"]],
                         ["Je revois les acteurs.", "Procédure rédigée · 14 étapes"])


class ThrottleTest(unittest.TestCase):
    """Un suivi, pas un roman : 5 lignes au plus, espacées, sans doublon."""

    def run_thoughts(self, summaries, interval):
        async def go():
            queue: asyncio.Queue = asyncio.Queue()
            with mock.patch.object(turn_progress, "_french_line", side_effect=lambda s: s.split("**")[2].strip()), \
                    mock.patch.object(turn_progress, "MIN_INTERVAL", interval), \
                    turn_progress.progress_scope(queue) as sink:
                for summ in summaries:
                    turn_progress.thought(summ)
                while turn_progress.pending(sink):
                    await asyncio.sleep(0.02)
            await asyncio.sleep(0.05)
            return [queue.get_nowait()["label"] for _ in range(queue.qsize())]
        return asyncio.run(go())

    def test_at_most_five_and_no_duplicates(self):
        summaries = [f"**Titre {i % 7}** Ligne {i}." for i in range(14)]
        lines = self.run_thoughts(summaries, 0)
        self.assertEqual(lines, ["Ligne 0.", "Ligne 1.", "Ligne 2.", "Ligne 3.", "Ligne 4."])

    def test_spaced_out(self):
        lines = self.run_thoughts([f"**T{i}** Ligne {i}." for i in range(6)], 60)
        self.assertEqual(lines, ["Ligne 0."])  # les suivantes arrivent trop tôt


if __name__ == "__main__":
    unittest.main()
