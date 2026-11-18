"""
Points ouverts d'une procédure (lot 5) : ce qui reste à confirmer auprès des métiers.

Deux origines, toujours distinguées :
- « source » : écrit tel quel dans les documents (« à confirmer », « ? », « outil ? »…) ;
- « detecte » : manque relevé par l'assistant (acteur absent, règle floue, étape implicite).
"""

import json
import re
import uuid
from typing import Any, Dict, List

TYPES = ["acteur à confirmer", "outil à confirmer", "étape implicite", "règle à préciser", "autre"]
MAX_SOURCE_CHARS = 30_000


def build_prompt(procedure: Dict[str, Any], source_texts: List[str]) -> str:
    rows = [
        {"id": r.get("id"), "étape": r.get("étape"), "acteur": r.get("acteur"), "outil": r.get("outil"),
         "type": r.get("typeBpmn"), "condition": r.get("condition")}
        for r in procedure.get("workflow") or []
    ]
    sources = "\n\n".join(source_texts)[:MAX_SOURCE_CHARS]
    return f"""Tu relis une procédure métier formalisée pour lister ce qui reste à confirmer auprès des personnes concernées.

PROCÉDURE « {procedure.get('title')} » (étapes au format JSON) :
{json.dumps(rows, ensure_ascii=False)}

EXTRAITS DES SOURCES (peuvent être vides) :
{sources or "(aucun texte disponible)"}

Liste les points ouverts. Deux origines, à ne jamais confondre :
- "source" : le document le signale explicitement (« à confirmer », « ? », « outil ? », « acteur à confirmer », pointillés…). Cite la mention.
- "detecte" : tu constates un manque réel dans la procédure (acteur vide, outil inconnu pour une saisie, décision sans règle, étape implicite). N'invente rien : seulement ce que les étapes montrent.

Réponds UNIQUEMENT par un tableau JSON, au plus 15 éléments, chacun :
{{"step_id": "<id de l'étape concernée ou null>", "question": "<question courte, posée au métier>",
  "type": "<un de : {', '.join(TYPES)}>", "acteur_a_interroger": "<qui peut répondre, ou ''>",
  "origine": "source" | "detecte", "source": "<mention citée si origine = source, sinon ''>"}}
Si rien n'est ouvert, réponds []."""


def parse(text: str, step_ids: List[str]) -> List[Dict[str, Any]]:
    """Lecture tolérante ; chaque point reçoit un id et le statut « ouvert »."""
    text = re.sub(r"```(?:json)?", "", text or "").strip()
    match = re.search(r"\[[\s\S]*\]", text)
    try:
        data = json.loads(match.group(0) if match else text)
    except ValueError:
        return []
    known = set(step_ids)
    points = []
    for item in data if isinstance(data, list) else []:
        if not isinstance(item, dict) or not str(item.get("question") or "").strip():
            continue
        step = item.get("step_id")
        points.append({
            "id": str(uuid.uuid4()),
            "step_id": step if step in known else None,
            "question": str(item["question"]).strip()[:500],
            "type": item.get("type") if item.get("type") in TYPES else "autre",
            "acteur": str(item.get("acteur_a_interroger") or "")[:120],
            "origine": "source" if item.get("origine") == "source" else "detecte",
            "source": str(item.get("source") or "")[:300],
            "statut": "ouvert",
            "reponse": "",
        })
    return points[:15]
