# clinic/processor/web_search.py
"""
Recherche sur internet (Google, via l'outil de recherche de Gemini) : une réponse en français fondée sur des pages
trouvées, avec les requêtes faites et les sources citées. Les sources s'affichent dans le message et dans le panneau
« Cette conversation » ; quand l'utilisateur veut une procédure, ce qui a été trouvé sert de matière à la rédaction.
"""

import logging
from typing import Any, Dict, List, Optional

from google.genai import types

from prompts.glossaire import extrait

logger = logging.getLogger(__name__)

MAX_SOURCES = 12

PROMPT = """{regles}

Tu réponds à une question en t'appuyant sur une RECHERCHE SUR INTERNET (utilise l'outil de recherche).
Contexte : ProcessMate, formalisation de procédures (souvent bancaires : Bank Al-Maghrib, Office des changes, SWIFT,
LAB-FT, normes de place…).

- Cherche les textes officiels, réglementaires ou les sources reconnues, récents de préférence.
- Réponds en français, directement, en quelques paragraphes ou une courte liste ; dis la date ou la référence d'un texte
  quand la source la donne.
- N'affirme que ce que les pages trouvées disent. Si la recherche ne trouve rien de fiable, dis-le simplement.
- Pas de tableau : des paragraphes courts et des listes. Ne recopie pas les adresses des pages : elles sont affichées à part.
{suite}
CONVERSATION RÉCENTE :
{historique}

DEMANDE :
{question}
"""

SUITE_PROCEDURE = """- L'utilisateur veut ensuite une procédure : décris précisément le déroulé que décrivent les sources (étapes, acteurs,
  contrôles, délais, documents), il servira de matière à la rédaction.
"""


def _history_text(history: Optional[List[Dict[str, str]]]) -> str:
    lines = [f"{'Utilisateur' if h.get('role') == 'user' else 'Assistant'} : {str(h.get('content') or '')[:400]}"
             for h in (history or [])[-6:]]
    return "\n".join(lines) or "(aucune)"


def search(question: str, history: Optional[List[Dict[str, str]]] = None, for_procedure: bool = False) -> Dict[str, Any]:
    """Appel synchrone (à lancer dans asyncio.to_thread). Renvoie {text, queries, sources: [{title, uri, domain}]}."""
    from manager.model_manager import GeminiModel, generate_content
    prompt = PROMPT.format(regles=extrait("LA RÉPONSE"), suite=SUITE_PROCEDURE if for_procedure else "",
                           historique=_history_text(history), question=question.strip())
    config = types.GenerateContentConfig(tools=[types.Tool(google_search=types.GoogleSearch())], temperature=0.2)
    response = generate_content(prompt, config, "Recherche sur internet", [GeminiModel.FLASH, GeminiModel.LITE])
    text = (response.text or "").strip()
    queries: List[str] = []
    sources: List[Dict[str, str]] = []
    seen = set()
    for cand in getattr(response, "candidates", None) or []:
        gm = getattr(cand, "grounding_metadata", None)
        if not gm:
            continue
        for q in gm.web_search_queries or []:
            if q and q not in queries:
                queries.append(q)
        for chunk in gm.grounding_chunks or []:
            web = getattr(chunk, "web", None)
            if web and web.uri and web.uri not in seen:
                seen.add(web.uri)
                sources.append({"title": (web.title or web.domain or "Source")[:200], "uri": web.uri,
                                "domain": (web.domain or web.title or "")[:120]})
    if not queries and not sources:
        logger.info("ℹ️ Recherche sur internet : le modèle a répondu sans chercher")
    return {"text": text, "queries": queries[:10], "sources": sources[:MAX_SOURCES]}


def as_material(found: Dict[str, Any]) -> str:
    """Ce que la recherche a trouvé, comme matière pour rédiger une procédure (sources nommées)."""
    names = "; ".join(s.get("title") or s.get("domain") or "" for s in found.get("sources") or [])
    return ("\n\nCE QUE LA RECHERCHE SUR INTERNET A TROUVÉ (seule matière à utiliser, avec la demande) :\n"
            f"{found.get('text') or ''}\nSources : {names or 'aucune source trouvée'}")
