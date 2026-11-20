# clinic/processor/intent_detector.py
"""
Détection d'intention légère via Gemini.
Appel rapide (~1-2s) avant de router vers la bonne logique.
"""

import asyncio
import json
import re
import logging
from typing import Optional, List, Dict
from dataclasses import dataclass

from prompts.intent_prompt import get_intent_prompt

logger = logging.getLogger(__name__)


@dataclass
class IntentResult:
    intent: str                          # explain | generate | patch | regen | web_search | clarify | transcribe
    clarify_question: Optional[str]      # question à poser si clarify
    reference_files: list                # fichiers de référence (style/template)
    source_files: list                   # fichiers sources (données réelles)
    summary: str                         # résumé de l'action prévue
    transcribe_mode: str = "combined"    # image_only | text_only | combined (si intent=transcribe)
    target_procedure: Optional[int] = None  # numéro (1…n) de la procédure concernée, si plusieurs


async def detect_intent(
    message: str,
    has_workflow: bool,
    filenames: list,
    history: Optional[List[Dict]] = None,
    procedures: Optional[List[Dict]] = None,
) -> IntentResult:
    """
    Détecte l'intention du message utilisateur via Gemini Flash Lite.
    Modèle rapide, flash en secours (voir plus bas).
    """
    prompt = get_intent_prompt(message, has_workflow, filenames, history, procedures)

    # Classer une phrase : modèle rapide (mesuré : aussi juste que flash, 0,8 s au lieu de 4 à 16 s
    # avec flash et sa réflexion complète). Flash seulement en secours si le rapide est en erreur.
    from manager.model_manager import GeminiModel, generate_content
    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(generate_content, prompt, None, "Intent detection",
                              [GeminiModel.LITE, GeminiModel.FLASH]),
            timeout=20)
        result = {"success": True, "result": response}
    except Exception as e:
        result = {"success": False, "message": str(e)[:200]}

    if not result["success"]:
        logger.warning(f"⚠️ Intent detection failed: {result['message']} — fallback generate/clarify")
        return _fallback(has_workflow, filenames)

    try:
        text = result["result"].text.strip()
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            text = json_match.group(0)
        data = json.loads(text)

        intent = data.get("intent", "clarify")

        # patch sans workflow → clarify
        if intent == "patch" and not has_workflow:
            return IntentResult(
                intent="clarify",
                clarify_question="Il n'y a pas encore de processus dans le tableau. Souhaitez-vous en générer un nouveau ?",
                reference_files=[],
                source_files=filenames,
                summary="Aucun workflow existant pour appliquer une modification"
            )

        # regen sans workflow → generate
        if intent == "regen" and not has_workflow:
            intent = "generate"

        transcribe_mode = data.get("transcribe_mode", "combined")
        if transcribe_mode not in ("image_only", "text_only", "combined"):
            transcribe_mode = "combined"

        return IntentResult(
            intent=intent,
            clarify_question=data.get("clarify_question"),
            reference_files=data.get("reference_files", []),
            source_files=data.get("source_files", filenames),
            summary=data.get("summary", ""),
            transcribe_mode=transcribe_mode,
            target_procedure=_target(data.get("target_procedure"), len(procedures or [])),
        )

    except Exception as e:
        logger.error(f"❌ Intent parsing failed: {e}")
        return _fallback(has_workflow, filenames)


def _target(value, count: int) -> Optional[int]:
    """Numéro de procédure renvoyé par le modèle, s'il est valable (1…count)."""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if 1 <= n <= count else None


def _fallback(has_workflow: bool, filenames: list) -> IntentResult:
    """Fallback safe si Gemini échoue ou parse rate."""
    return IntentResult(
        intent="generate" if not has_workflow else "clarify",
        clarify_question="Pouvez-vous préciser ce que vous souhaitez faire ?" if has_workflow else None,
        reference_files=[],
        source_files=filenames,
        summary="Fallback intent"
    )