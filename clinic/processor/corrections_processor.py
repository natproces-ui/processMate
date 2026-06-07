"""
Analyse des annotations de révision dans un PDF via Gemini (multimodal).
Détecte surlignements, manuscrits, ratures, annotations sur diagrammes, etc.
"""
from __future__ import annotations
import asyncio
import base64
import json
import logging
import os
import re
import uuid
from typing import Any

from manager.model_manager import GeminiModelManager

logger = logging.getLogger(__name__)

# ─── Prompt spécialisé détection d'annotations ────────────────

_SYSTEM = """Tu es un expert en révision documentaire de procédures bancaires.
Tu analyses visuellement un document PDF et identifies TOUTES les marques de révision
laissées par un relecteur ou validateur.

Types d'annotations à détecter :
- SURLIGNEMENT : texte surligné en jaune, vert, rose, bleu ou autre couleur
- MANUSCRIT : texte écrit à la main en marge, entre les lignes ou sur le document
- RATURE : texte barré ou supprimé
- SOULIGNEMENT : texte souligné (correction signalée)
- ENCADREMENT : texte ou zone encadrée ou entourée d'un cercle
- DIAGRAMME : annotation ou correction portant sur un logigramme ou diagramme
- COMMENTAIRE : note de révision, point d'interrogation, flèche explicative

Pour chaque annotation :
- Identifie la page précise
- Décris le texte ou la zone concernée
- Interprète ce que l'annotateur demande ou signale
- Propose une correction concrète et professionnelle

Si le document n'a aucune annotation visible, retourne un tableau vide.
Retourne uniquement du JSON valide, sans markdown."""

_JSON_SCHEMA = """
Retourne ce JSON (sans markdown) :
{
  "document_title": "Titre déduit du document ou nom de fichier",
  "total_pages_analyzed": 5,
  "remarks": [
    {
      "id": "r1",
      "page": 2,
      "type": "surlignement" | "manuscrit" | "rature" | "soulignement" | "encadrement" | "diagramme" | "commentaire",
      "zone": "En-tête section 3 / Étape 4 du logigramme / Paragraphe 2...",
      "texte_concerne": "Extrait exact ou description du texte/zone annoté(e)",
      "interpretation": "Ce que l'annotateur demande ou signale (en 1-2 phrases)",
      "suggestion": "Correction concrète et professionnelle proposée par l'IA (en 1-3 phrases)",
      "criticite": "haute" | "moyenne" | "faible"
    }
  ],
  "synthese": "Résumé global des révisions en 2-3 phrases"
}"""


# ─── Helpers ──────────────────────────────────────────────────

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


def _normalize_remarks(remarks: list) -> list:
    """Assure que chaque remarque a un id unique et les champs requis."""
    result = []
    for i, r in enumerate(remarks):
        result.append({
            "id": r.get("id") or f"r{i+1}",
            "page": r.get("page") or 1,
            "type": r.get("type") or "commentaire",
            "zone": r.get("zone") or "",
            "texte_concerne": r.get("texte_concerne") or "",
            "interpretation": r.get("interpretation") or "",
            "suggestion": r.get("suggestion") or "",
            "criticite": r.get("criticite") or "moyenne",
            "status": "pending",   # pending | treated | ignored
        })
    return result


# ─── Analyse principale ────────────────────────────────────────

async def analyze_pdf_corrections(pdf_bytes: bytes, filename: str) -> dict:
    """
    Envoie le PDF à Gemini et retourne le résultat structuré.
    Retourne: { session_id, filename, document_title, remarks, synthese }
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY non configurée")

    manager = GeminiModelManager(api_key)
    pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")

    prompt = _SYSTEM + "\n\n" + _JSON_SCHEMA
    contents: list[Any] = [
        prompt,
        {"inline_data": {"mime_type": "application/pdf", "data": pdf_b64}},
    ]

    async def _task(model_name: str):
        model = manager.get_model(model_name)
        return await asyncio.wait_for(
            asyncio.to_thread(
                model.generate_content,
                model=model_name,
                contents=contents,
            ),
            timeout=180,
        )

    result = await manager.execute_with_fallback(_task, task_name="Analyse corrections PDF")
    if not result.get("success"):
        raise ValueError(result.get("message") or "Erreur Gemini lors de l'analyse")

    raw_text = getattr(result["result"], "text", "") or ""
    parsed = _parse_json(raw_text)

    remarks = _normalize_remarks(parsed.get("remarks") or [])

    return {
        "session_id": str(uuid.uuid4()),
        "filename": filename,
        "document_title": parsed.get("document_title") or filename,
        "total_pages": parsed.get("total_pages_analyzed") or 1,
        "remarks": remarks,
        "synthese": parsed.get("synthese") or "",
    }
