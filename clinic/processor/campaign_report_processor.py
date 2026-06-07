"""
Génération du rapport de campagne de formalisation avec Gemini.
Produit un contenu narratif structuré en JSON pour alimenter le document Word.
"""
from __future__ import annotations
import asyncio
import json
import logging
import os
import re
from typing import Any

from manager.model_manager import GeminiModelManager

logger = logging.getLogger(__name__)

# ─── Prompt ───────────────────────────────────────────────────

_SYSTEM = """Tu es un expert en gestion documentaire et pilotage de projets de formalisation
de procédures bancaires. Tu génères des rapports professionnels, clairs et orientés action,
destinés à la direction et aux équipes opérationnelles.

Ton rapport doit être :
- Rédigé en français professionnel, style bancaire
- Concret et basé uniquement sur les données fournies
- Structuré, synthétique, sans répétition
- Orienté vers les constats et les actions correctives"""


def _build_prompt(campaign: dict) -> str:
    stats = campaign.get("stats", {})
    procs = campaign.get("procedures", [])

    # Résumé des statuts
    status_lines = []
    blocked = []
    notes_list = []

    for p in procs:
        lc = p.get("lifecycle") or {}
        stages_done = lc.get("stages_done", 0)
        stages_total = lc.get("stages_total", 6)
        nom = p.get("procedure_nom") or p.get("procedure_ref") or p.get("procedure_id", "")[:8]
        st = p.get("status", "pending")
        assigned = p.get("responsible_name") or p.get("assigned_to") or "Non assigné"
        note = p.get("notes", "")

        status_lines.append(
            f"  - {nom} | statut: {st} | étapes: {stages_done}/{stages_total} | responsable: {assigned}"
        )
        if st in ("pending",) and stages_done == 0:
            blocked.append(nom)
        if note:
            notes_list.append(f"  - {nom}: {note}")

    procs_block = "\n".join(status_lines) if status_lines else "  Aucune procédure."
    blocked_block = ", ".join(blocked) if blocked else "Aucune procédure bloquée identifiée."
    notes_block = "\n".join(notes_list) if notes_list else "  Aucune note de retour."

    return f"""{_SYSTEM}

DONNÉES DE LA CAMPAGNE :
- Titre : {campaign.get("title", "N/A")}
- Description : {campaign.get("description") or "Non renseignée"}
- Statut : {campaign.get("status", "N/A")}
- Période : {campaign.get("start_date") or "N/A"} → {campaign.get("end_date") or "N/A"}
- Total procédures : {stats.get("total", 0)}
- Formalisées / validées : {stats.get("done", 0)}
- En cours : {stats.get("in_progress", 0)}
- En attente : {stats.get("pending", 0)}
- Avancement global : {stats.get("progress_pct", 0)}%

DÉTAIL DES PROCÉDURES :
{procs_block}

PROCÉDURES EN ATTENTE SANS PROGRESSION :
{blocked_block}

NOTES DE RETOUR / OBSERVATIONS :
{notes_block}

---
Retourne uniquement du JSON valide (sans markdown) avec cette structure exacte :
{{
  "diagnostic": "positif" | "attention" | "critique",
  "resume_executif": "Paragraphe de 3 à 5 phrases synthétisant l'état de la campagne, les résultats clés et le niveau de risque global.",
  "analyse_avancement": "Paragraphe de 3 à 5 phrases analysant la progression, les tendances, les points forts et les zones de retard.",
  "points_blocage": [
    {{
      "titre": "Titre court du point de blocage",
      "description": "Description précise du blocage et de son impact",
      "procedures_impactees": ["nom1", "nom2"]
    }}
  ],
  "recommandations": [
    {{
      "priorite": "haute" | "moyenne" | "faible",
      "action": "Action courte et précise",
      "description": "Description actionnable avec le quoi et le comment",
      "responsable": "Coordinateur | Équipe | Direction"
    }}
  ],
  "conclusion": "Paragraphe de conclusion évaluant le bilan de la campagne et les prochaines étapes recommandées."
}}"""


# ─── Parse ─────────────────────────────────────────────────────

def _parse_json(text: str) -> dict:
    text = text.strip()
    # Retire les blocs markdown si présents
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except Exception:
        # Tentative d'extraction entre accolades
        m = re.search(r"\{[\s\S]+\}", text)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                pass
    return {}


# ─── Entrée principale ─────────────────────────────────────────

async def generate_campaign_narrative(campaign: dict) -> dict:
    """
    Appelle Gemini pour produire le contenu narratif du rapport.
    Retourne un dict avec les clés : diagnostic, resume_executif,
    analyse_avancement, points_blocage, recommandations, conclusion.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY non configurée")

    manager = GeminiModelManager(api_key)
    prompt = _build_prompt(campaign)
    contents: list[Any] = [prompt]

    async def _task(model_name: str):
        model = manager.get_model(model_name)
        return await asyncio.wait_for(
            asyncio.to_thread(
                model.generate_content,
                model=model_name,
                contents=contents,
            ),
            timeout=120,
        )

    result = await manager.execute_with_fallback(_task, task_name="Rapport campagne")
    if not result.get("success"):
        raise ValueError(result.get("message") or "Erreur Gemini lors de la génération du rapport")

    raw_text = getattr(result["result"], "text", "") or ""
    parsed = _parse_json(raw_text)

    # Valeurs de secours si Gemini retourne quelque chose d'incomplet
    return {
        "diagnostic": parsed.get("diagnostic", "attention"),
        "resume_executif": parsed.get("resume_executif", "Rapport généré automatiquement."),
        "analyse_avancement": parsed.get("analyse_avancement", ""),
        "points_blocage": parsed.get("points_blocage") or [],
        "recommandations": parsed.get("recommandations") or [],
        "conclusion": parsed.get("conclusion", ""),
    }
