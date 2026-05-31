# clinic/processor/explain_processor.py
"""
Processeur explain pour ProcessMate.
Répond aux questions sur le workflow ou le processus — sans modification.
Garde le fil de la conversation comme un vrai chat.
"""

import asyncio
import logging
import json
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

EXPLAIN_SYSTEM_PROMPT = """Tu es l'assistant ProcessMate, expert en formalisation de processus métier bancaires.

L'utilisateur te pose une question ou fait une réflexion sur le workflow affiché ou sur le processus en général.
Tu dois répondre en langage naturel, de façon concise et utile — comme dans une vraie conversation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RÈGLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Réponds directement à la question posée
- Si un workflow est fourni, appuie-toi dessus pour répondre avec précision
- Si la question est vague ou rhétorique ("ça sert à quoi"), explique ce que fait le processus
  en t'appuyant sur les étapes disponibles
- Tu peux suggérer une action concrète à la fin si c'est pertinent
  (ex: "Tu veux que je modifie quelque chose ?")
- Sois bref : 2-4 phrases max sauf si la question nécessite plus de détail
- Tu parles français, tu tutoies l'utilisateur
- Ne génère PAS de JSON, ne modifie PAS le workflow — texte pur uniquement
"""


def _build_workflow_summary(workflow: List[Dict]) -> str:
    if not workflow:
        return "Aucun workflow chargé."

    lines = [f"Workflow actuel ({len(workflow)} étapes) :"]
    for row in workflow:
        étape = row.get("étape", "")
        acteur = row.get("acteur", "")
        dept = row.get("département", "")
        type_bpmn = row.get("typeBpmn", "Task")
        outputs = row.get("outputs", [])
        targets = ", ".join(o.get("targetId", "") for o in outputs) if outputs else "—"

        actor_str = f"{acteur}" + (f" ({dept})" if dept else "")
        lines.append(f"  - [{row.get('id')}] {étape} | {type_bpmn} | {actor_str} → {targets}")

    return "\n".join(lines)


def get_explain_prompt(
    message: str,
    workflow: Optional[List[Dict]],
    history: List[Dict]
) -> str:
    workflow_section = _build_workflow_summary(workflow) if workflow else "Aucun workflow chargé."

    history_str = ""
    if history:
        last = history[-6:]
        history_str = "\nHistorique de la conversation :\n"
        for h in last:
            role = "Utilisateur" if h["role"] == "user" else "Assistant"
            history_str += f"[{role}] : {h['content']}\n"

    return f"""{EXPLAIN_SYSTEM_PROMPT}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORKFLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{workflow_section}
{history_str}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MESSAGE DE L'UTILISATEUR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{message}

RÉPONDS MAINTENANT :"""


class ExplainProcessor:
    def __init__(self, model_manager):
        self.model_manager = model_manager

    async def handle_explain(
        self,
        message: str,
        workflow: Optional[List[Dict]],
        history: List[Dict]
    ) -> Dict:
        prompt = get_explain_prompt(message, workflow, history)

        async def _task(model_name: str):
            model = self.model_manager.get_model(model_name)
            response = await asyncio.wait_for(
                asyncio.to_thread(model.generate_content, model=model_name, contents=prompt),
                timeout=30
            )
            return response

        result = await self.model_manager.execute_with_fallback(_task, task_name="Chat explain")
        if not result["success"]:
            raise ValueError(result["message"])

        answer = result["result"].text.strip()

        return {
            "success": True,
            "intent": "explain",
            "answer": answer,
            "workflow": workflow or [],
            "title": None,
            "enrichments": {},
            "procedureMetadata": {}
        }