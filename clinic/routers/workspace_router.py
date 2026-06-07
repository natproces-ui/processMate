"""
Workspace ProcessMate — Révision IA d'une procédure.
POST /api/workspace/revise  → Gemini analyse le contenu et retourne des points de révision
"""
from __future__ import annotations
import asyncio
import json
import logging
import os
import re
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from manager.model_manager import GeminiModelManager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/workspace", tags=["Workspace"])

# ─── Session store en mémoire ─────────────────────────────────
_revision_sessions: dict[str, dict] = {}


# ─── Modèles ──────────────────────────────────────────────────

class RevisionRequest(BaseModel):
    procedure_id: str
    nom: str
    ref: str | None = None
    objet: str | None = None
    perimetre: str | None = None
    acteurs: str | None = None
    regles_gestion: list[str] | None = None
    workflow_steps: list[dict] | None = None
    enrichments: dict | None = None
    lifecycle_stages: list[dict] | None = None


class RevisionPointUpdate(BaseModel):
    status: str   # "pending" | "noted" | "dismissed"


# ─── Prompt révision ──────────────────────────────────────────

_REVISION_SYSTEM = """Tu es un expert senior en organisation bancaire, qualité documentaire
et conformité procédurale. Tu révises des procédures bancaires et identifies les points
d'amélioration, les lacunes, les ambiguïtés et les non-conformités.

Ta révision est objective, professionnelle et orientée action.
Tu ne modifies RIEN — tu identifies et suggères uniquement.
Si la procédure est complète et correcte sur un point, tu ne le mentionnes pas.
Si tu ne trouves aucun point à améliorer, tu le dis clairement."""

_REVISION_SCHEMA = """
Retourne uniquement du JSON valide (sans markdown) :
{
  "diagnostic_global": "bon" | "acceptable" | "a_ameliorer" | "insuffisant",
  "resume": "Appréciation globale en 2-3 phrases.",
  "points": [
    {
      "id": "p1",
      "section": "Objet" | "Périmètre" | "Acteurs" | "Règles de gestion" | "Workflow" | "Étape N" | "Structure générale",
      "type": "lacune" | "ambiguite" | "non_conformite" | "amelioration" | "erreur",
      "constat": "Description précise du problème identifié (1-2 phrases).",
      "suggestion": "Ce que l'utilisateur devrait corriger ou compléter (1-3 phrases). Ne pas écrire le texte à la place de l'utilisateur.",
      "criticite": "haute" | "moyenne" | "faible",
      "status": "pending"
    }
  ]
}
Si aucun point, retourne "points": [] et diagnostic_global: "bon"."""


def _build_revision_prompt(req: RevisionRequest) -> str:
    lines = [
        _REVISION_SYSTEM,
        f"\nPROCÉDURE : {req.nom}",
        f"Référence : {req.ref or 'N/A'}",
    ]
    if req.objet:
        lines.append(f"\nOBJET :\n{req.objet}")
    if req.perimetre:
        lines.append(f"\nPÉRIMÈTRE :\n{req.perimetre}")
    if req.acteurs:
        lines.append(f"\nACTEURS :\n{req.acteurs}")
    if req.regles_gestion:
        lines.append("\nRÈGLES DE GESTION :")
        for i, r in enumerate(req.regles_gestion, 1):
            lines.append(f"  {i}. {r}")
    if req.workflow_steps:
        lines.append(f"\nWORKFLOW ({len(req.workflow_steps)} étapes) :")
        for i, step in enumerate(req.workflow_steps, 1):
            if isinstance(step, dict):
                actor = step.get("actor") or step.get("acteur") or step.get("departement") or ""
                task = step.get("task") or step.get("tache") or step.get("label") or str(step)
                lines.append(f"  {i:02d}. [{actor}] {task}")
    if req.lifecycle_stages:
        stages_done = [s.get("title", "") for s in req.lifecycle_stages if s.get("status") == "completed"]
        lines.append(f"\nCYCLE DE VIE : {len(stages_done)}/{len(req.lifecycle_stages)} étapes complétées"
                     + (f" ({', '.join(stages_done)})" if stages_done else ""))
    lines.append("\n" + _REVISION_SCHEMA)
    return "\n".join(lines)


def _parse_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\{[\s\S]+\}", text)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                pass
    return {}


# ─── Endpoints ────────────────────────────────────────────────

@router.post("/revise")
async def revise_procedure(req: RevisionRequest):
    """Lance une révision IA sur le contenu d'une procédure."""
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(500, "GOOGLE_API_KEY non configurée")

    manager = GeminiModelManager(api_key)
    prompt = _build_revision_prompt(req)

    async def _task(model_name: str):
        model = manager.get_model(model_name)
        return await asyncio.wait_for(
            asyncio.to_thread(model.generate_content, model=model_name, contents=[prompt]),
            timeout=120,
        )

    result = await manager.execute_with_fallback(_task, "Révision procédure")
    if not result.get("success"):
        raise HTTPException(500, result.get("message") or "Erreur Gemini")

    raw = getattr(result["result"], "text", "") or ""
    parsed = _parse_json(raw)

    # Normalise les points
    points = []
    for i, p in enumerate(parsed.get("points") or []):
        points.append({
            "id": p.get("id") or f"p{i+1}",
            "section":   p.get("section", "Structure générale"),
            "type":      p.get("type", "amelioration"),
            "constat":   p.get("constat", ""),
            "suggestion":p.get("suggestion", ""),
            "criticite": p.get("criticite", "moyenne"),
            "status":    "pending",
        })

    session_id = str(uuid.uuid4())
    session = {
        "session_id":       session_id,
        "procedure_id":     req.procedure_id,
        "procedure_nom":    req.nom,
        "diagnostic_global":parsed.get("diagnostic_global", "acceptable"),
        "resume":           parsed.get("resume", ""),
        "points":           points,
    }
    _revision_sessions[session_id] = session
    return {"success": True, **session}


@router.patch("/revise/{session_id}/points/{point_id}")
async def update_revision_point(session_id: str, point_id: str, body: RevisionPointUpdate):
    """Met à jour le statut d'un point de révision."""
    session = _revision_sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session introuvable")
    if body.status not in ("pending", "noted", "dismissed"):
        raise HTTPException(400, "Statut invalide")
    for p in session.get("points", []):
        if p["id"] == point_id:
            p["status"] = body.status
            return {"success": True}
    raise HTTPException(404, "Point introuvable")
