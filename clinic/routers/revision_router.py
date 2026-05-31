# clinic/routers/revision_router.py
"""
Router de révision intelligente du workflow
Reçoit le workflow courant + instruction en langage naturel
Retourne un patch JSON à appliquer côté frontend
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging
import json
import re
import os
import asyncio

from manager.model_manager import GeminiModelManager
from prompts.revision_prompt import get_revision_prompt

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/revision",
    tags=["Workflow Revision"]
)


class RevisionRequest(BaseModel):
    workflow: List[Dict[str, Any]]   # Table1Row[]
    instruction: str                  # Instruction en langage naturel
    history: Optional[List[Dict[str, str]]] = []  # Historique des révisions précédentes


class RevisionResponse(BaseModel):
    success: bool
    operations: List[Dict[str, Any]]
    explanation: str
    operations_count: int


def _parse_revision_response(text: str) -> Dict[str, Any]:
    """Parse la réponse JSON de Gemini"""
    try:
        text = text.strip()
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            text = json_match.group(0)
        text = re.sub(r'```json\s*', '', text)
        text = re.sub(r'```\s*', '', text)

        data = json.loads(text)

        if "operations" not in data:
            raise ValueError("Clé 'operations' manquante dans la réponse")

        return data

    except json.JSONDecodeError as e:
        logger.error(f"❌ Erreur parsing révision: {e}\n{text[:300]}")
        raise ValueError(f"Réponse invalide de l'IA: {str(e)}")


def _validate_operations(operations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Valide et normalise les opérations"""
    valid_types = {"add", "update", "delete", "move", "relink"}
    validated = []

    for op in operations:
        op_type = op.get("type", "")
        if op_type not in valid_types:
            logger.warning(f"⚠️ Opération inconnue ignorée: {op_type}")
            continue

        # Validation par type
        if op_type == "add":
            if "row" not in op:
                logger.warning("⚠️ Opération 'add' sans 'row' ignorée")
                continue
            # S'assurer que outputs est un tableau
            if "outputs" not in op["row"]:
                op["row"]["outputs"] = []

        elif op_type in ("update", "delete", "move", "relink"):
            if "id" not in op:
                logger.warning(f"⚠️ Opération '{op_type}' sans 'id' ignorée")
                continue

        validated.append(op)

    return validated


@router.post("/apply", response_model=RevisionResponse)
async def apply_revision(request: RevisionRequest):
    """
    Applique une révision intelligente au workflow.

    Reçoit :
        - workflow : Table1Row[] courant
        - instruction : instruction en langage naturel
        - history : historique optionnel des révisions précédentes

    Retourne :
        - operations : liste des opérations à appliquer côté frontend
        - explanation : explication des modifications
    """
    if not request.instruction.strip():
        raise HTTPException(status_code=400, detail="L'instruction ne peut pas être vide")

    if len(request.workflow) == 0:
        raise HTTPException(status_code=400, detail="Le workflow est vide")

    logger.info(f"✏️ Révision demandée : '{request.instruction[:80]}...' sur {len(request.workflow)} étapes")

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GOOGLE_API_KEY non configurée")

    model_manager = GeminiModelManager(api_key)
    prompt = get_revision_prompt(request.workflow, request.instruction)

    async def _revision_task(model_name: str):
        model = model_manager.get_model(model_name)
        response = await asyncio.wait_for(
            asyncio.to_thread(
                model.generate_content,
                model=model_name,
                contents=prompt
            ),
            timeout=60
        )
        return response

    result = await model_manager.execute_with_fallback(
        _revision_task,
        task_name="Révision workflow"
    )

    if not result["success"]:
        raise HTTPException(status_code=422, detail=result["message"])

    try:
        parsed = _parse_revision_response(result["result"].text)
        operations = _validate_operations(parsed.get("operations", []))
        explanation = parsed.get("explanation", "Modifications appliquées.")

        logger.info(f"✅ Révision : {len(operations)} opération(s) — {explanation[:60]}")

        return RevisionResponse(
            success=True,
            operations=operations,
            explanation=explanation,
            operations_count=len(operations)
        )

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Erreur révision: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur interne: {str(e)}")


@router.get("/info")
async def get_info():
    return {
        "module": "Workflow Revision",
        "version": "1.0.0",
        "description": "Révision intelligente du workflow via instructions en langage naturel",
        "supported_operations": ["add", "update", "delete", "move", "relink"],
        "examples": [
            "Ajoute une étape de validation entre l'étape 5 et 6 dans la swimlane Conformité",
            "L'étape 12 doit pointer vers 8 au lieu de 13",
            "Renomme l'étape 7 en 'Contrôler les pièces justificatives'",
            "Supprime l'étape 15, elle est redondante avec la 12",
            "Transforme l'étape 9 en gateway — si conforme vers 10, sinon retour vers 4"
        ]
    }