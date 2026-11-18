"""Agent outillé du Studio (processor/studio_agent.py) avec un modèle simulé."""
import asyncio
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from google.genai import types  # noqa: E402

from processor import studio_agent as agent  # noqa: E402

WORKFLOW = [
    {"id": "1", "étape": "Début", "typeBpmn": "StartEvent", "acteur": "Agence", "outputs": [{"targetId": "2", "label": ""}]},
    {"id": "2", "étape": "Saisir la demande", "typeBpmn": "Task", "acteur": "Agence", "outil": "", "outputs": [{"targetId": "3", "label": ""}]},
    {"id": "3", "étape": "Valider", "typeBpmn": "Task", "acteur": "DCI", "outil": "Geflog", "outputs": [{"targetId": "4", "label": ""}]},
    {"id": "4", "étape": "Fin", "typeBpmn": "EndEvent", "acteur": "DCI", "outputs": []},
]


def call(name, **args):
    return SimpleNamespace(name=name, args=args)


def reply(calls=None, text=""):
    content = types.Content(role="model", parts=[types.Part.from_text(text=text or "…")])
    return SimpleNamespace(function_calls=calls or None, text=text, candidates=[SimpleNamespace(content=content)])


def scripted(*responses):
    it = iter(responses)
    return lambda contents, config, task: next(it)


async def collect(ctx, gen, disconnected=False):
    async def is_disc():
        return disconnected
    return [ev async for ev in agent.run_agent(ctx, is_disc, gen)]


def ctx(**kw):
    base = dict(message="Ajoute une étape de contrôle", history=[], files=[], workflow=WORKFLOW, metadata={"nom": "Demande"})
    base.update(kw)
    return agent.AgentContext(**base)


class AgentLoopTest(unittest.TestCase):
    def test_reads_then_proposes_without_writing(self):
        c = ctx()
        before = [dict(r) for r in c.workflow]
        gen = scripted(
            reply([call("lire_procedure")]),
            reply([call("proposer_modification", explication="Contrôle ajouté",
                        operations=[{"type": "add", "after_id": "2", "row": {"id": "NEW_1", "étape": "Contrôler", "acteur": "DCI"}}])]),
            reply(text="J'ai proposé une étape de contrôle."),
        )
        events = asyncio.run(collect(c, gen))
        proposals = [e for e in events if e["type"] == "agent_proposal"]
        self.assertEqual(len(proposals), 1)
        self.assertEqual(proposals[0]["kind"], "modification")
        self.assertEqual(events[-1], {"type": "message", "text": "J'ai proposé une étape de contrôle."})
        self.assertEqual(c.workflow, before)  # aucune écriture

    def test_invalid_operations_rejected(self):
        result, events = agent.execute_tool("proposer_modification",
                                            {"explication": "x", "operations": [{"type": "update", "id": "99", "fields": {}}, {"type": "boom"}]}, ctx())
        self.assertIn("erreur", result)
        self.assertEqual(events, [])

    def test_step_limit(self):
        with mock.patch.dict(os.environ, {"AGENT_MAX_STEPS": "2"}):
            gen = scripted(reply([call("lister_sources")]), reply([call("lister_sources")]))
            events = asyncio.run(collect(ctx(), gen))
        self.assertIn("nombre maximal", events[-1]["text"])

    def test_stops_when_user_leaves(self):
        events = asyncio.run(collect(ctx(), scripted(), disconnected=True))
        self.assertEqual(events, [])

    def test_create_procedure_queues_generation(self):
        c = ctx(workflow=[], files=[{"filename": "deck.pptx", "type": "pptx", "office": {"text": "## Diapositive 1"}}])
        gen = scripted(reply([call("creer_procedure", titre="Organiser", fichiers=["deck.pptx"])]), reply(text="Je formalise « Organiser »."))
        asyncio.run(collect(c, gen))
        self.assertEqual(c.to_generate[0]["title"], "Organiser")
        self.assertEqual(c.to_generate[0]["sources"], [{"file": "deck.pptx"}])

    def test_unknown_tool_and_tool_failure_do_not_crash(self):
        gen = scripted(reply([call("outil_fantome")]), reply(text="ok"))
        events = asyncio.run(collect(ctx(), gen))
        self.assertEqual(events[-1]["text"], "ok")


class ToolsTest(unittest.TestCase):
    def test_sources(self):
        c = ctx(files=[{"filename": "Note.docx", "type": "docx", "office": {"text": "Le CGO saisit les heures. Acteur à confirmer."}},
                       {"filename": "scan.pdf", "type": "pdf", "data": b"%PDF"}])
        self.assertEqual(len(agent.execute_tool("lister_sources", {}, c)[0]["sources"]), 2)
        self.assertIn("CGO", agent.execute_tool("lire_source", {"nom": "note.docx"}, c)[0]["texte"])
        self.assertIn("info", agent.execute_tool("lire_source", {"nom": "scan.pdf"}, c)[0])
        hits = agent.execute_tool("chercher_dans_sources", {"requete": "à confirmer"}, c)[0]["resultats"]
        self.assertEqual(hits[0]["source"], "Note.docx")

    def test_open_point_proposal(self):
        result, events = agent.execute_tool("proposer_point_ouvert", {"question": "Qui valide ?", "step_id": "3", "type": "acteur à confirmer"}, ctx())
        self.assertEqual(events[0]["point"]["step_id"], "3")
        self.assertEqual(events[0]["point"]["statut"], "ouvert")

    def test_answer_unknown_point(self):
        result, events = agent.execute_tool("proposer_reponse_point", {"point_id": "x", "reponse": "DCI"}, ctx())
        self.assertIn("erreur", result)

    def test_complexity(self):
        m = agent.complexity(WORKFLOW)
        self.assertEqual((m["etapes"], m["changements_acteur"]), (2, 1))
        self.assertEqual(m["taches_sans_outil"], ["2"])


if __name__ == "__main__":
    unittest.main()
