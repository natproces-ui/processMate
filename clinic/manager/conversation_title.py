"""
Titre d'une conversation, comme chez Claude ou ChatGPT : un vrai titre court (« Ouverture de
compte bancaire étudiant au Maroc »), pas le début de la phrase coupé.

Donné par un modèle rapide en tâche de fond pendant le premier tour ; tant qu'il n'a pas pu
l'être (modèle indisponible), le titre reste « provisoire » et est retenté au tour suivant.
Un titre choisi par l'utilisateur n'est jamais remplacé.
"""

import logging
import re
from typing import Any, Dict, List, Optional

from manager import conversation_store as store

logger = logging.getLogger(__name__)

DEFAULT = "Nouvelle conversation"


def _first_user_message(msgs: List[Dict[str, Any]]) -> str:
    for m in msgs:
        if m.get("role") == "user" and (m.get("content") or "").strip():
            return m["content"]
    return ""


def is_provisional(title: Optional[str], first_message: str) -> bool:
    """Vrai si le titre n'a pas été donné par l'utilisateur ni par le modèle."""
    t = (title or "").strip()
    if not t or t == DEFAULT:
        return True
    return bool(first_message) and t == store.title_from(first_message, [])


def clean(raw: str) -> str:
    """Une ligne, sans guillemets, sans point final, 70 caractères au plus."""
    t = (raw or "").strip().splitlines()[0] if (raw or "").strip() else ""
    t = re.sub(r"^(titre\s*:\s*)", "", t, flags=re.I)
    t = t.strip(" \t\"'«»“”*#. ")
    if len(t) > 70:
        t = t[:70].rsplit(" ", 1)[0]
    return t


def generate(message: str, filenames: List[str]) -> str:
    from manager.model_manager import generate_content
    from manager.model_routing import TaskKind, routing_scope

    sources = f"\nFichiers joints : {', '.join(filenames[:5])}" if filenames else ""
    prompt = (
        "Donne un titre à cette conversation avec un assistant de formalisation de procédures, "
        "comme le ferait Claude ou ChatGPT dans sa liste de conversations.\n"
        "Règles : en français, 3 à 7 mots, le sujet réel (pas « Demande de… » ni « Conversation sur… »), "
        "majuscule au premier mot seulement (sauf noms propres et sigles), sans guillemets ni point final. "
        "Corrige les fautes de frappe. Réponds par le titre seul.\n\n"
        f"Premier message : {message.strip()[:1500]}{sources}"
    )
    with routing_scope(TaskKind.SYNTHESE_COURTE, ["texte"]):
        response = generate_content(prompt, None, "Titre de conversation")
    return clean(getattr(response, "text", "") or "")


def ensure_title(conv: Dict[str, Any], message: str, files: List[Dict[str, Any]]) -> Optional[str]:
    """Donne un vrai titre à la conversation si elle n'en a pas encore. Renvoie le nouveau titre, sinon None.
    Synchrone (à lancer dans un thread) ; ne lève jamais."""
    try:
        msgs = store.messages(conv["id"])
        first = _first_user_message(msgs) or message
        if not is_provisional(conv.get("title"), first):
            return None
        names = [f.get("filename", "") for f in files if f.get("filename")]
        try:
            title = generate(first, names)
        except Exception as e:
            logger.warning(f"⚠️ Titre de conversation indisponible : {str(e)[:120]}")
            title = ""
        if not title:
            # repli : mieux que « Nouvelle conversation » ; sera retenté au prochain tour
            title = store.title_from(first, files)
            if title == (conv.get("title") or ""):
                return None
        store.update(conv["id"], conv["owner_id"], title=title)
        return title
    except Exception as e:
        logger.warning(f"⚠️ Titre de conversation non enregistré : {str(e)[:120]}")
        return None
