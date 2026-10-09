# clinic/processor/studio_planner.py
"""
Aiguillage d'un tour de conversation du Studio.

Un appel rapide (modèle LITE, quel que soit le niveau choisi) lit le message et les
fichiers, repère les procédures et choisit l'action. Des garde-fous côté serveur
corrigent les décisions incohérentes : le modèle propose, le code dispose.
"""
import base64
import io
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from google.genai import types

from manager.model_manager import GeminiModel, generate_content
from prompts.studio_planner_prompt import build_planner_prompt

logger = logging.getLogger(__name__)

ACTIONS = {"generate", "propose", "merge", "edit", "answer"}
# Au-delà, on ne génère pas sans que l'utilisateur ait validé la sélection
MAX_AUTO_GENERATE = 5


@dataclass
class StudioPlan:
    action: str
    reply: str
    procedures: List[Dict[str, Any]] = field(default_factory=list)
    targets: List[str] = field(default_factory=list)
    merged_title: Optional[str] = None
    references: List[str] = field(default_factory=list)  # fichiers modèles (style, format), pas des sources
    adjustments: List[str] = field(default_factory=list)  # corrections appliquées par les garde-fous

    def to_dict(self) -> Dict[str, Any]:
        return {
            "action": self.action, "reply": self.reply, "procedures": self.procedures,
            "targets": self.targets, "merged_title": self.merged_title, "references": self.references, "adjustments": self.adjustments,
        }


def file_to_parts(f: Dict[str, Any]) -> list:
    """Même envoi que la découverte : PDF tel quel, image réduite à 1024 px, Office extrait."""
    if f.get("type") in ("docx", "pptx"):
        from processor.office_extract import office_parts
        return office_parts(f)
    raw = f.get("data")
    if not raw:
        return []
    try:
        if f["type"] == "pdf":
            return [{"inline_data": {"mime_type": "application/pdf", "data": base64.b64encode(raw).decode()}}]
        if f["type"] == "image":
            from PIL import Image
            img = Image.open(io.BytesIO(raw))
            if max(img.size) > 1024:
                img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            return [img]
    except Exception as e:
        logger.error(f"❌ Fichier illisible {f.get('filename')}: {e}")
    return []


def _parse_json(text: str) -> Dict[str, Any]:
    text = re.sub(r"```(?:json)?", "", text or "").strip()
    match = re.search(r"\{[\s\S]*\}", text)
    return json.loads(match.group(0) if match else text)


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def apply_guardrails(
    data: Dict[str, Any],
    filenames: List[str],
    has_workflow: bool,
    previous_proposal: Optional[List[Dict[str, Any]]] = None,
) -> StudioPlan:
    adjustments: List[str] = []
    action = data.get("action") if data.get("action") in ACTIONS else "answer"
    reply = (data.get("reply") or "").strip()

    # Une procédure doit citer au moins un fichier réellement joint (pas d'invention depuis un sommaire)
    known = {_norm(f): f for f in filenames}
    references = [known[_norm(r)] for r in (data.get("references") or []) if _norm(r) in known]
    ref_set = set(references)
    procedures: List[Dict[str, Any]] = []
    for p in data.get("procedures") or []:
        sources = []
        for s in p.get("sources") or []:
            real = known.get(_norm(s.get("file", "")))
            if real is None and len(filenames) == 1:
                real = filenames[0]  # un seul fichier : la source ne peut être que lui
            if real and real not in ref_set:  # un fichier de référence n'est pas une source
                sources.append({"file": real, "pages": s.get("pages") or None})
        if p.get("title") and sources:
            procedures.append({**p, "sources": sources})
        elif p.get("title"):
            adjustments.append(f"écartée faute de source : {p.get('title')}")

    # Suite d'une proposition (« prends la 2 ») : pas de nouveaux fichiers, on garde la liste précédente
    if not procedures and previous_proposal and action in ("generate", "merge", "propose"):
        procedures = previous_proposal

    seen, unique = set(), []
    for i, p in enumerate(procedures, 1):
        pid = p.get("id") if p.get("id") and p.get("id") not in seen else f"p{i}"
        seen.add(pid)
        unique.append({**p, "id": pid})
    procedures = unique
    ids = [p["id"] for p in procedures]
    targets = [t for t in (data.get("targets") or []) if t in ids]

    if action == "edit" and not has_workflow:
        action = "generate" if procedures else "answer"
        adjustments.append("edit sans procédure ouverte")
    if action in ("generate", "propose", "merge") and not procedures:
        action = "answer"
        reply = reply or "Je n'ai pas trouvé de procédure exploitable dans ces fichiers. Pouvez-vous préciser ce que vous attendez ?"
        adjustments.append("aucune procédure repérée")
    if action == "propose" and len(procedures) == 1:
        action, targets = "generate", ids
        adjustments.append("une seule procédure : génération directe")
    if action == "merge" and not targets:
        targets = ids
    if action == "generate" and not targets:
        if len(procedures) == 1:
            targets = ids
        else:
            action = "propose"
            adjustments.append("plusieurs procédures sans cible : proposition")
    if action == "generate" and len(targets) > MAX_AUTO_GENERATE:
        action = "propose"
        adjustments.append(f"{len(targets)} procédures : confirmation demandée")
        reply = f"{len(targets)} procédures sont concernées. Elles sont toutes sélectionnées : confirmez pour lancer la génération."

    if adjustments:
        logger.info(f"🧭 Aiguillage corrigé : {adjustments}")
    return StudioPlan(
        action=action, reply=reply, procedures=procedures, targets=targets,
        merged_title=(data.get("merged_title") or None) if action == "merge" else None,
        references=references,
        adjustments=adjustments,
    )


def plan_turn(
    message: str,
    files: List[Dict[str, Any]],
    has_workflow: bool,
    history: Optional[List[Dict[str, str]]] = None,
    previous_proposal: Optional[List[Dict[str, Any]]] = None,
) -> StudioPlan:
    """Appel synchrone (à lancer dans asyncio.to_thread)."""
    filenames = [f["filename"] for f in files]
    parts: list = [build_planner_prompt(message, filenames, has_workflow, history, previous_proposal)]
    for f in files:
        parts.append(f"--- Fichier : {f['filename']} ---")
        parts.extend(file_to_parts(f))
    response = generate_content(
        parts,
        config=types.GenerateContentConfig(temperature=0.1, response_mime_type="application/json"),
        task_name="Aiguillage Studio",
        models=[GeminiModel.LITE, GeminiModel.FLASH],  # toujours rapide : la qualité se joue à la génération
    )
    try:
        data = _parse_json(response.text)
    except Exception as e:
        logger.warning(f"⚠️ Réponse d'aiguillage illisible ({e}) : {(response.text or '')[:200]}")
        data = {"action": "answer", "reply": ""}
    return apply_guardrails(data, filenames, has_workflow, previous_proposal)
