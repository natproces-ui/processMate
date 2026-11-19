"""Progression en direct d'un tour (lot B) : étapes précises et texte au fil de l'eau."""
import asyncio
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from manager import turn_progress  # noqa: E402
from routers import studio_router  # noqa: E402


class FakeProcessor:
    async def process_message(self, **_kw):
        turn_progress.status("think", "Compris : expliquer l'étape 3", "done")
        turn_progress.status("work", "Rédaction de la réponse", "running")

        def in_thread():  # comme generate_content_stream, depuis un thread
            for t in ("L'étape 3 ", "vérifie ", "le dossier."):
                turn_progress.emit({"type": "text_delta", "text": t})
        await asyncio.to_thread(in_thread)
        return {"success": True, "intent": "explain", "answer": "L'étape 3 vérifie le dossier.", "workflow": []}


async def collect():
    out = []
    with mock.patch("processor.chat_processor.ChatProcessor", FakeProcessor):
        async for chunk in studio_router._delegate_to_chat("pourquoi l'étape 3 ?", [], [], [], None, None):
            out.append(json.loads(chunk.split("data: ", 1)[1]))
    return out


class ProgressTest(unittest.TestCase):
    def test_events_stream_before_result(self):
        events = asyncio.run(collect())
        types = [e["type"] for e in events]
        self.assertEqual(types[:2], ["status", "status"])
        self.assertEqual(events[0]["label"], "Compris : expliquer l'étape 3")
        self.assertEqual("".join(e["text"] for e in events if e["type"] == "text_delta"), "L'étape 3 vérifie le dossier.")
        done = [e for e in events if e["type"] == "status" and e["id"] == "work" and e["state"] == "done"]
        self.assertEqual(done[0]["label"], "Réponse rédigée")
        self.assertEqual(types[-1], "chat_result")

    def test_emit_without_scope_is_harmless(self):
        turn_progress.emit({"type": "text_delta", "text": "x"})  # aucun effet, aucune erreur
        self.assertFalse(turn_progress.active())

    def test_reading_label(self):
        files = [{"filename": "deck.pptx", "type": "pptx", "office": {"text": "## Diapositive 1\n## Diapositive 2"}},
                 {"filename": "note.docx", "type": "docx", "office": {"text": ""}}]
        self.assertEqual(studio_router._reading_label(files), "Lecture de deck.pptx (2 diapositives), note.docx")

    def test_work_done_labels(self):
        self.assertEqual(studio_router._work_done_label({"intent": "generate", "workflow": [1, 2, 3]}), "Procédure rédigée : 3 étapes")
        self.assertEqual(studio_router._work_done_label({"intent": "patch", "operations_count": 1}), "Procédure modifiée : 1 changement")


class StreamedWorkflowTest(unittest.TestCase):
    """Procédure décrite en texte : les étapes partent à l'écran pendant l'écriture."""

    RAW = ('{"title": "Ouverture de compte", "workflow": ['
           '{"id": "1", "étape": "Début", "typeBpmn": "StartEvent", "acteur": "Client", "outputs": [{"targetId": "2"}]}, '
           '{"id": "2", "étape": "Vérifier les pièces", "typeBpmn": "UserTask", "acteur": "Agent", "outputs": [{"targetId": "3"}]}, '
           '{"id": "3", "étape": "Fin", "typeBpmn": "EndEvent", "acteur": "Agent", "outputs": []}'
           '], "enrichments": {}}')

    def run_stream(self, chunks=None, fail=False):
        from processor.chat_processor import ChatProcessor
        proc = ChatProcessor.__new__(ChatProcessor)
        from processor.img_processor import ImageProcessor
        proc.img_processor = ImageProcessor.__new__(ImageProcessor)
        events = []

        def fake_stream(*_a, **_k):
            if fail:
                raise RuntimeError("quota")
            yield from chunks

        async def go():
            queue: asyncio.Queue = asyncio.Queue()
            with turn_progress.progress_scope(queue), \
                    mock.patch("manager.model_manager.generate_content_stream", fake_stream):
                text = await proc._streamed_workflow("prompt", 10, "test")
            await asyncio.sleep(0)
            while not queue.empty():
                events.append(queue.get_nowait())
            return text

        return asyncio.run(go()), events

    def test_rows_stream_then_full_text(self):
        chunks = [self.RAW[i:i + 40] for i in range(0, len(self.RAW), 40)]
        text, events = self.run_stream(chunks)
        self.assertEqual(text, self.RAW)
        rows = [e["row"]["étape"] for e in events if e["type"] == "workflow_preview"]
        self.assertEqual(rows, ["Début", "Vérifier les pièces", "Fin"])
        labels = [e["label"] for e in events if e["type"] == "status"]
        self.assertEqual(labels[-1], "Rédaction de la procédure : 3 étapes")

    def test_failure_resets_preview(self):
        text, events = self.run_stream(fail=True)
        self.assertIsNone(text)
        self.assertEqual(events[-1]["type"], "workflow_preview_reset")

    def test_inactive_outside_turn(self):
        from processor.chat_processor import ChatProcessor
        proc = ChatProcessor.__new__(ChatProcessor)
        self.assertIsNone(asyncio.run(proc._streamed_workflow("p", 1, "t")))


if __name__ == "__main__":
    unittest.main()
