# clinic/manager/turn_procedures.py
"""
Fin d'un tour du chat : le serveur écrit lui-même les procédures de la conversation et leurs versions
(docs/conversation-serveur.md, lot B), à partir de ce que le tour a produit (TurnRecorder).

- procédures générées (aiguillage, découpage, déplacement…) : nouvelles procédures, version « generation » ;
- procédure rédigée ou transcrite par le chat : nouvelle procédure (« generation » / « transcription ») ;
- réécriture à partir d'un fichier : nouvelle version de la procédure visée (« reecriture ») ;
- modification : le serveur applique lui-même les opérations à la version courante (« modification ») ;
- procédures remplacées ou retirées : archivées.

Les clés sont celles qu'utilise l'écran : « <id du message côté écran>:p1 », « …:chat ».
"""

import logging
from typing import Any, Dict, List, Optional

from manager import conversation_procedures as cp
from manager.workflow_operations import apply_with_descriptions, summarize_changes

logger = logging.getLogger(__name__)


def _content(g: Dict[str, Any]) -> Dict[str, Any]:
    return {"title": g.get("title"), "workflow": g.get("workflow") or [], "enrichments": g.get("enrichments") or {},
            "procedureMetadata": g.get("procedureMetadata") or {}}


def persist(conversation_id: str, recorder, message_id: Optional[str], turn: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Écrit ce que le tour a produit et renvoie les procédures de la conversation (version courante de chacune)."""
    prefix = turn.get("client_message_id") or message_id or "tour"
    author = turn.get("author")
    intent = recorder.payload.get("intent")
    target = recorder.target_key or turn.get("target_key") or turn.get("active")

    for archived in recorder.payload.get("archived") or []:
        cp.set_archived(conversation_id, archived.get("keys") or [], True)

    for g in recorder.generated:
        n = len(g.get("workflow") or [])
        if g.get("id") == "chat" and intent == "regen" and target and cp.get(conversation_id, target):
            cp.add_version(cp.get(conversation_id, target), _content(g), "reecriture", message_id,
                           f"réécrite à partir des sources ({n} étapes)", author)
        elif g.get("id") == "chat":
            cp.create(conversation_id, f"{prefix}:chat", _content(g),
                      "transcription" if intent == "transcribe" else "generation", message_id, f"{n} étapes", author)
        else:
            cp.create(conversation_id, f"{prefix}:{g.get('id')}", _content(g), "generation", message_id,
                      f"{n} étapes", author)

    data = recorder.chat_data or {}
    if intent == "patch" and data.get("operations") and target:
        proc = cp.get(conversation_id, target)
        if proc:
            cur = cp.current(conversation_id, target) or {}
            rows, enr = apply_with_descriptions(cur.get("workflow") or [], cur.get("enrichments") or {}, data["operations"])
            resume = (data.get("explanation") or "").strip()[:300] or summarize_changes(cur.get("workflow"), rows)
            # le diagramme est recalculé par l'écran (ses positions correspondaient à la version d'avant)
            cp.add_version(proc, {**cur, "workflow": rows, "enrichments": enr, "bpmnXml": None}, "modification",
                           message_id, resume, author)
        else:
            logger.warning(f"⚠️ Modification sur une procédure inconnue côté serveur : {target}")
    return cp.list_procedures(conversation_id)
